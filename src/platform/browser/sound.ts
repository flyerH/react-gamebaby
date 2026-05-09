import type { Note, Sound, SoundEffect } from '@/engine/types';

/**
 * 8-bit 短音效：sample 切片 + oscillator 合成两条路混合
 *
 * - move / over —— 真机感强、单 oscillator 合不出来的复杂音色（FFT 双峰、
 *   非纯频率衰减），用预录的 PCM 采样切片调度。资源在 public/sounds/sfx.m4a，
 *   内部按时序拼接两段 PCM；播放时 BufferSource.start(0, offset, duration)
 *   切片即可
 * - rotate / clear / start / pause —— 简单脉冲，PRESETS 用 OscillatorNode
 *   合成即可，不走 sample，节省体积
 *
 * Sample 在 createBrowserSound 时就 fire-and-forget 开始 fetch + decode，
 * 用户首次按键时基本已就绪。加载失败 / 未完成 → move/over 静默（合成
 * 版还原度太低，不做 fallback 反而更干净）；其它 effect 不依赖 sample，
 * 永远可用。
 *
 * 浏览器自动播放策略：AudioContext 在首次用户手势前处于 'suspended'，
 * 即使 enabled=true 调 play 也无声。play() 入口检查到 suspended 会
 * 立即 resume()——若调用栈在 user gesture 内，浏览器允许；否则
 * 静默 no-op，等下次手势再试。canAutoplay() 提前探测当前权限，便于
 * 调用方决定是直接开机播放旋律还是等用户首次按键再触发。
 */

/**
 * 单个 voice = 一段独立的振荡器配置；多个 voice 同时排进 AudioContext
 * 形成"叠声"。复杂音色 FFT 上常呈多峰，单 voice 还原不出来，需要 layered
 * 合成
 */
interface Voice {
  readonly type: OscillatorType;
  /** 起始频率（Hz） */
  readonly freq: number;
  /** 持续时长（秒） */
  readonly duration: number;
  /** 可选：目标频率，存在时做指数滑移 */
  readonly slideTo?: number;
  /** 峰值音量（0..1），默认 0.12 */
  readonly gain?: number;
  /** 起音延迟（秒）：相对 play 触发时刻往后推 */
  readonly delay?: number;
}

interface Preset {
  readonly voices: ReadonlyArray<Voice>;
}

/**
 * 走 oscillator 合成的 effect。move / over 不在这里——它们由 SAMPLE_RANGES
 * 接管。Partial 让类型显式表达"不是每个 effect 都有合成预设"
 */
const PRESETS: Partial<Record<SoundEffect, Preset>> = {
  rotate: { voices: [{ type: 'square', freq: 440, duration: 0.05 }] },
  clear: { voices: [{ type: 'square', freq: 800, duration: 0.12, slideTo: 1200 }] },
  start: { voices: [{ type: 'square', freq: 600, duration: 0.18, slideTo: 900 }] },
  pause: { voices: [{ type: 'square', freq: 330, duration: 0.1 }] },
};

/**
 * Sample 切片时间表（秒）。对应 public/sounds/sfx.m4a 的内部布局：
 *   [0       , 0.1437)   move   —— 按键 click
 *   [0.1437  , 1.2874)   over   —— 死亡嗡鸣
 */
const SAMPLE_URL = 'sounds/sfx.m4a';
const SAMPLE_RANGES: Partial<Record<SoundEffect, { offset: number; duration: number }>> = {
  move: { offset: 0, duration: 0.1437 },
  over: { offset: 0.1437, duration: 1.1437 },
};
/**
 * Sample 总音量缩放（0..1）。原录音电平较高，直送 destination 会盖过
 * oscillator 合成的其它音效；这里统一压一档让 move/over 与 PRESETS 听感
 * 平衡。觉得整体太响 / 太轻就动这个常量
 */
const SAMPLE_GAIN = 0.4;

/**
 * 跨浏览器 + 测试桩：从 globalThis 上找构造器
 * 部分 Safari / iOS 仍用 webkitAudioContext 前缀名
 */
interface GlobalWithAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function resolveAudioContextCtor(): typeof AudioContext | null {
  const g = globalThis as unknown as GlobalWithAudio;
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/**
 * 静音 / 取消静音的过渡时间常数（秒）。setTargetAtTime 的 timeConstant 参数，
 * 让 masterGain 在约 30ms 内从 0 → 1 / 1 → 0 渐变，避免硬切产生的"咔哒"声
 */
const MUTE_RAMP_TIME = 0.01;

export function createBrowserSound(): Sound {
  // 默认开声音；首次 play 之前 AudioContext 都处于 suspended，由 play()
  // 入口的 resume 兜底，对调用方完全透明。用户想关声音按 Sound 键即可。
  let enabled = true;
  let audioCtx: AudioContext | null = null;
  // 全局主音量节点：所有音源（oscillator / sample）连到这里再到 destination。
  // 静音 = 把 gain 平滑拉到 0，正在播的音源会"实时消音"而不是被中止；解除
  // 静音 = 拉回 1，正在播的尾段会立即可闻。比单纯"play 入口 if(!enabled) return"
  // 更贴近真硬件 mute 按键
  let masterGain: GainNode | null = null;
  let sampleBuffer: AudioBuffer | null = null;
  let sampleLoading = false;

  const ensureCtx = (): AudioContext | null => {
    if (audioCtx) return audioCtx;
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = enabled ? 1 : 0;
      masterGain.connect(audioCtx.destination);
    } catch {
      audioCtx = null;
      masterGain = null;
    }
    return audioCtx;
  };

  // 主输出节点：优先 masterGain，缺失时兜底直连 destination（理论不会发生）
  const out = (ac: AudioContext): AudioNode => masterGain ?? ac.destination;

  // 预加载 sample buffer：mount 即触发，让用户首次按键时基本已就绪。
  // jsdom / 缺 fetch / 网络失败都吞掉（sampleBuffer 留 null，move/over 静默）
  const preloadSample = (): void => {
    if (sampleBuffer || sampleLoading) return;
    if (typeof fetch !== 'function') return;
    const ac = ensureCtx();
    if (!ac) return;
    sampleLoading = true;
    void (async () => {
      try {
        const res = await fetch(SAMPLE_URL);
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const arr = await res.arrayBuffer();
        sampleBuffer = await ac.decodeAudioData(arr);
      } catch {
        // 静默：sampleBuffer 仍是 null，move/over 永久走静默分支
      } finally {
        sampleLoading = false;
      }
    })();
  };
  preloadSample();

  return {
    play(effect: SoundEffect): void {
      // 注意：不再因 enabled=false 提前 return。所有音源照常调度，masterGain
      // 决定听不听见——这样静音期间触发的死亡音 / 按键 click 仍在跑，玩家
      // 切回 ON 时能立刻听见尾段，对应"实时 mute"语义
      const ac = ensureCtx();
      if (!ac) return;
      // 首次有声调用：AudioContext 仍是 suspended（浏览器要求手势）。
      // 此处一定来自用户按键事件链，已构成手势，resume() 会成功。
      if (ac.state === 'suspended') void ac.resume();

      // sample 路径：move / over 切片播放
      const range = SAMPLE_RANGES[effect];
      if (range) {
        // buffer 还没就绪 / 加载失败 → 静默。不 fallback 合成（用户确认合成版完全不像）
        if (!sampleBuffer) return;
        const src = ac.createBufferSource();
        src.buffer = sampleBuffer;
        const gainNode = ac.createGain();
        gainNode.gain.value = SAMPLE_GAIN;
        src.connect(gainNode).connect(out(ac));
        // when=0 表示立即；offset / duration 单位秒，对齐 sfx.m4a 内部布局
        src.start(0, range.offset, range.duration);
        return;
      }

      // oscillator 合成路径：rotate / clear / start / pause
      const preset = PRESETS[effect];
      if (!preset) return;
      const now = ac.currentTime;
      for (const v of preset.voices) {
        const startAt = now + (v.delay ?? 0);
        const end = startAt + v.duration;
        const osc = ac.createOscillator();
        const gainNode = ac.createGain();

        osc.type = v.type;
        osc.frequency.setValueAtTime(v.freq, startAt);
        if (v.slideTo !== undefined) {
          // exponentialRampToValueAtTime 要求目标值 > 0；预设里已保证
          osc.frequency.exponentialRampToValueAtTime(v.slideTo, end);
        }
        const peak = v.gain ?? 0.12;
        gainNode.gain.setValueAtTime(peak, startAt);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(gainNode).connect(out(ac));
        osc.start(startAt);
        osc.stop(end);
      }
    },
    playMelody(notes: ReadonlyArray<Note>): () => void {
      const noop = (): void => {
        /* 没有 oscillator 可中止时的占位 */
      };
      if (notes.length === 0) return noop;
      const ac = ensureCtx();
      if (!ac) return noop;
      if (ac.state === 'suspended') void ac.resume();

      // 沿 ac.currentTime 把每个音符依次排队；休止符（freq=0）只推进时
      // 间游标不发声。每音符独占一个 Oscillator 节点，自动衰减到末尾，
      // 浏览器会在 stop 时回收，不需要手动断开
      const oscillators: OscillatorNode[] = [];
      let t = ac.currentTime;
      for (const { freq, duration } of notes) {
        if (freq > 0) {
          const osc = ac.createOscillator();
          const gainNode = ac.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, t);
          // 0.95 倍 duration 给一点点 release，相邻音符不糊在一起
          gainNode.gain.setValueAtTime(0.08, t);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.95);
          osc.connect(gainNode).connect(out(ac));
          osc.start(t);
          osc.stop(t + duration);
          oscillators.push(osc);
        }
        t += duration;
      }
      // 返回 cancel：把所有未结束的 oscillator 立即停掉。已经自然结束的
      // 节点 stop() 会抛 InvalidStateError，吞掉即可（语义上仍是 no-op）
      return () => {
        for (const osc of oscillators) {
          try {
            osc.stop();
          } catch {
            // 已结束节点重复 stop 是无害的
          }
        }
      };
    },
    setEnabled(on: boolean): void {
      enabled = on;
      const ac = ensureCtx();
      if (!ac || !masterGain) return;
      // 平滑过渡 ~30ms 避免硬切的"咔哒"声；setTargetAtTime 是指数趋近，
      // 30ms 内基本到位
      masterGain.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, MUTE_RAMP_TIME);
      if (on && ac.state === 'suspended') void ac.resume();
    },
    async canAutoplay(): Promise<boolean> {
      const ac = ensureCtx();
      if (!ac) return false;
      if (ac.state === 'running') return true;
      try {
        await ac.resume();
      } catch {
        // Safari 等浏览器在没有手势时 resume() 会 reject
        return false;
      }
      // 用显式断言绕过 TS control-flow narrowing：resume 之后 state 类型
      // 应当重新读，但编译器仍按 ensureCtx 返回时的窄类型推
      return (ac.state as AudioContextState) === 'running';
    },
    get enabled() {
      return enabled;
    },
  };
}
