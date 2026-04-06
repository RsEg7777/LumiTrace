'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  Gauge,
  Layers3,
  PlayCircle,
  Sparkles,
  Wand2,
} from 'lucide-react';

const featureCards = [
  {
    icon: Eye,
    title: 'Depth-Aware Illumination',
    description:
      'Enhance global illumination using depth-assisted scene understanding for more physically plausible output.',
  },
  {
    icon: Layers3,
    title: 'Preset-Driven Quality',
    description:
      'Switch from Draft to Cinematic in one click, then fine-tune samples, bounces, denoising, and exposure.',
  },
  {
    icon: Gauge,
    title: 'Live Progress Tracking',
    description:
      'Track every job in real time via WebSocket updates with resilient polling fallback and safe completion flow.',
  },
  {
    icon: Clock3,
    title: 'History and Continuity',
    description:
      'Persist local work instantly and sync cloud jobs when signed in, so production history is never lost.',
  },
];

const workflowSteps = [
  {
    title: 'Upload scene media',
    copy: 'Drop an image or video, validate format and size, and preview before launch.',
  },
  {
    title: 'Tune render profile',
    copy: 'Apply presets or manually calibrate path tracing depth, sample count, and denoising.',
  },
  {
    title: 'Stream progress',
    copy: 'Observe queue state, stage transitions, and completion status in one control surface.',
  },
  {
    title: 'Compare and export',
    copy: 'Use side-by-side preview and download optimized output for downstream editing.',
  },
];

const metrics = [
  { label: 'Backend Runtime', value: 'FastAPI + Worker' },
  { label: 'Media Types', value: 'Images + Videos' },
  { label: 'Progress Transport', value: 'WebSocket + Polling' },
  { label: 'Job Lifecycle', value: 'Queued to Download' },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden pb-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.2),transparent_35%),radial-gradient(circle_at_80%_18%,rgba(251,146,60,0.22),transparent_35%),radial-gradient(circle_at_50%_85%,rgba(20,184,166,0.15),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:44px_44px]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080d1acc]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 text-slate-950 shadow-[0_0_26px_rgba(34,211,238,0.45)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-heading text-lg font-bold tracking-tight text-white">LumiTrace</p>
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Production Lighting Studio</p>
            </div>
          </div>

          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-white/10">
              Login
            </Link>
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_10px_28px_rgba(20,184,166,0.38)]"
            >
              Open Studio
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative mx-auto w-full max-w-7xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center"
        >
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
              <Wand2 className="h-3.5 w-3.5" />
              Real-Time Render Intelligence
            </p>

            <h1 className="font-heading text-balance text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
              Build cinematic light passes for images and videos with confidence.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              LumiTrace combines physically inspired path tracing with practical production controls: presets,
              progress streams, resilient processing, and account-backed history for teams that need speed and quality.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_35px_rgba(45,212,191,0.35)]"
              >
                Start Rendering
                <PlayCircle className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-100 hover:bg-white/10"
              >
                Sign In to Sync Jobs
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {metrics.map((metric, index) => (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.08 }}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur"
                >
                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{metric.label}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{metric.value}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="relative"
          >
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-cyan-400/30 via-transparent to-orange-400/30 blur-2xl" />

            <div className="glass-strong overflow-hidden rounded-[1.8rem] border border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <p className="text-sm font-semibold text-zinc-100">Studio Preview</p>
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                </div>
              </div>

              <div className="grid gap-4 p-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Render Configuration</p>
                  <div className="mt-3 space-y-2 text-sm text-zinc-200">
                    <p className="flex justify-between"><span>Samples</span><span>256</span></p>
                    <p className="flex justify-between"><span>Max Bounces</span><span>8</span></p>
                    <p className="flex justify-between"><span>Denoising</span><span>Enabled</span></p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/10 to-orange-400/10 p-4">
                  <div className="mb-3 flex items-center justify-between text-sm text-zinc-200">
                    <p>Job Progress</p>
                    <p className="font-semibold text-cyan-200">73%</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-300"
                      initial={{ width: '0%' }}
                      animate={{ width: '73%' }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-zinc-300">Tracing light paths and updating in real time.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto mt-20 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Feature Showcase</p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-white sm:text-4xl">
              Built like a real production surface
            </h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {featureCards.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ delay: index * 0.06 }}
              className="group rounded-3xl border border-white/10 bg-black/25 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-black/35"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/25 to-teal-400/25 text-cyan-200">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-100">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{feature.description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-black/30 p-6 sm:p-10">
          <p className="text-xs uppercase tracking-[0.18em] text-orange-200">Workflow</p>
          <h2 className="mt-3 font-heading text-3xl font-bold text-white sm:text-4xl">From upload to final frame</h2>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {workflowSteps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: index % 2 === 0 ? -8 : 8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ delay: index * 0.04 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Step {index + 1}</p>
                <p className="mt-2 text-lg font-semibold text-zinc-100">{step.title}</p>
                <p className="mt-2 text-sm text-zinc-300">{step.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-20 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-r from-cyan-500/20 via-teal-500/15 to-orange-400/20 p-8 sm:p-10"
        >
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-300/25 blur-[100px]" />
          <div className="absolute -left-20 -bottom-24 h-64 w-64 rounded-full bg-orange-300/20 blur-[110px]" />

          <div className="relative">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">Ready to launch</p>
            <h2 className="mt-3 font-heading text-3xl font-bold text-white sm:text-4xl">
              Turn raw footage into stylized, physically informed results.
            </h2>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900"
              >
                Open Studio
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/35 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Sign In
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-100/90">
              <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-200" />Account-backed history</p>
              <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-200" />Image and video pipeline</p>
              <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-200" />Resilient API and worker flow</p>
            </div>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
