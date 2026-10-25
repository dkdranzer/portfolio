"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { profile, sections } from "@/content/profile";
import type { RideScene, RideSceneOptions } from "@/lib/rideScene";

const BOAT_END = 0.745;
const stopOf = (id: string) => sections.find((s) => s.id === id)!.stop;
const group = (name: string) => profile.skills.find((g) => g.group === name)?.items ?? [];

function sceneOptions(projectStops: number[]): Omit<RideSceneOptions, "quality"> {
  return {
    billboards: [
      { stop: 0, title: "I BUILD AI AGENTS", sub: "LangGraph · Gemini · Pub/Sub", gantry: true },
      { stop: 0.12, title: "I SHIP TO PRODUCTION", sub: "Python · TypeScript · GCP · AWS", side: 1 },
      { stop: 0.45, title: "NEXT STOP: THE BAY", sub: "projects ahead", side: -1 },
    ],
    plaza: {
      stop: stopOf("experience"),
      screens: [
        { title: "Software Engineer", sub: "HealthFoundry.ai · Jul 2026 → now · agent orchestration, observability, Platform SDK", big: true },
        { title: "Data Engineer Intern", sub: "HealthFoundry.ai · Sep 2025 – Jun 2026 · real-time notifications, clinical documents", big: true },
        { title: "LangGraph", sub: "orchestration" },
        { title: "Pub/Sub", sub: "event-driven" },
        { title: "OpenTelemetry", sub: "8 services" },
        { title: "FHIR", sub: "healthcare data" },
        { title: "Gemini", sub: "agents" },
        { title: "SSE", sub: "real-time" },
      ],
    },
    skillPanels: [
      { stop: stopOf("skills"), title: "AI · LLM", items: group("AI / LLM") },
      { stop: stopOf("skills"), title: "Backend · Cloud", items: [...group("Languages"), ...group("Backend & Frontend"), ...group("Cloud & Ops")] },
      { stop: stopOf("skills"), title: "Data · Ops · Health", items: [...group("Observability"), ...group("Data"), ...group("Healthcare")] },
    ],
    projects: profile.projects.map((p, i) => ({ ...p, stop: projectStops[i] ?? 0.5 + (i + 0.5) * 0.045 })),
    eduCards: [
      { title: "B.E. Computer Science", sub: "BMS College of Engineering · 2022 – 2026" },
      { title: "CGPA 8.94", sub: "BMSCE · Class of 2026" },
      { title: "Certified", sub: "NPTEL Python for Data Science · RapidMiner ML Professional" },
    ],
  };
}

export default function Portfolio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = new Lenis({ lerp: reduce ? 1 : 0.09, smoothWheel: !reduce });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    let scene: RideScene | null = null;
    let cancelled = false;
    const video = videoRef.current;

    // scroll position -> journey progress. Anchored sections land exactly on
    // their stop when centred; everything in between is interpolated.
    const anchored = sections.filter((s) => s.anchor);
    const all = sections.map((s) => document.getElementById(s.id)!);
    const els = anchored.map((s) => document.getElementById(s.id)!);
    let anchors: number[] = [];
    const centre = (el: HTMLElement) => el.offsetTop + el.offsetHeight / 2 - window.innerHeight / 2;
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      anchors = els.map((el, i) => (i === 0 ? 0 : i === els.length - 1 ? max : Math.min(max, Math.max(0, centre(el)))));
    };
    const progressAt = (y: number) => {
      let i = 0;
      while (i < anchors.length - 2 && y > anchors[i + 1]) i++;
      const a = anchors[i], b = anchors[i + 1];
      const k = b > a ? Math.min(1, Math.max(0, (y - a) / (b - a))) : 0;
      return anchored[i].stop + (anchored[i + 1].stop - anchored[i].stop) * k;
    };
    measure();
    window.addEventListener("resize", measure);

    const onScroll = () => {
      const y = window.scrollY;
      const p = progressAt(y);
      setProgress(p);
      // active section = the one whose centre is nearest
      let best = 0, bd = Infinity;
      all.forEach((el, i) => { const d = Math.abs(centre(el) - y); if (d < bd) { bd = d; best = i; } });
      setActive(best);
      scene?.setProgress(p);
      if (video && video.duration) video.currentTime = p * (video.duration - 0.05);
    };
    lenis.on("scroll", onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });

    const onPointer = (e: PointerEvent) =>
      scene?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    window.addEventListener("pointermove", onPointer);

    if (!profile.rideVideo && canvasRef.current) {
      const probe = document.createElement("canvas");
      const ok = !!(probe.getContext("webgl2") || probe.getContext("webgl"));
      if (!ok) setNoWebGL(true);
      else
        Promise.all([import("@/lib/rideScene"), document.fonts?.ready ?? Promise.resolve()]).then(([mod]) => {
          if (cancelled || !canvasRef.current) return;
          measure();
          // each project billboard floats past when its card is centred
          const projectStops = [...document.querySelectorAll<HTMLElement>("[data-project]")].map((el) =>
            Math.min(BOAT_END - 0.012, progressAt(el.offsetTop + el.offsetHeight / 2 - window.innerHeight / 2)),
          );
          const low = window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) <= 4;
          scene = mod.createRideScene(canvasRef.current, { ...sceneOptions(projectStops), quality: low ? "low" : "high" });
          onScroll();
          requestAnimationFrame(() => setReady(true));
        });
    } else {
      setReady(true);
    }

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, { y: 60, opacity: 0, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
      });
      gsap.from(".hero-name > span > span", { yPercent: 110, duration: 1.4, ease: "expo.out", stagger: 0.08, delay: 0.3 });
      gsap.from(".hero-meta > *", { opacity: 0, y: 20, duration: 1, stagger: 0.1, delay: 0.9 });
      gsap.from(".boat-title span", { yPercent: 100, opacity: 0, duration: 1, stagger: 0.12, ease: "power4.out", scrollTrigger: { trigger: "#boat", start: "top 60%" } });
    });

    return () => {
      cancelled = true;
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis.destroy();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      scene?.dispose();
    };
  }, []);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = id === "home" ? 0 : el.offsetTop + el.offsetHeight / 2 - window.innerHeight / 2;
    lenisRef.current?.scrollTo(top, { duration: 2.4 });
  };

  const km = (progress * 14.6).toFixed(1);
  const flash = Math.max(0, 1 - Math.abs(progress - BOAT_END) / 0.018);
  const mode = progress < 0.5 ? "by bike" : progress < BOAT_END ? "by boat" : "above the clouds";

  return (
    <>
      <div className="stage" aria-hidden>
        {profile.rideVideo ? <video ref={videoRef} src={profile.rideVideo} muted playsInline preload="auto" /> : <canvas ref={canvasRef} />}
        {noWebGL && <div className="stage-fallback" />}
        <div className="vignette" />
        <div className="grain" />
        <div className="flash" style={{ opacity: flash }} />
      </div>
      <div className={`loader ${ready ? "done" : ""}`}><span>Loading…</span></div>

      <header className="topbar">
        <button className="logo" onClick={() => go("home")}>DK</button>
        <nav>
          {sections.filter((s) => s.nav).map((s) => (
            <button key={s.id} className={sections[active].id === s.id ? "on" : ""} onClick={() => go(s.id)}>{s.label}</button>
          ))}
        </nav>
        <a className="cta" href={`mailto:${profile.email}`}>Hire me</a>
      </header>

      <aside className="hud" aria-hidden>
        <div className="hud-km"><b>{km}</b><small>km · {mode}</small></div>
        <div className="hud-track">
          <i style={{ height: `${progress * 100}%` }} />
          {sections.map((s, i) => (
            <button key={s.id} style={{ top: `${s.stop * 100}%` }} className={progress >= s.stop - 0.005 ? "hit" : ""} onClick={() => go(s.id)} title={s.label} />
          ))}
        </div>
        <div className="hud-label">{String(active + 1).padStart(2, "0")} / {sections[active].label}</div>
      </aside>

      <main>
        <section id="home" className="hero">
          <h1 className="hero-name">
            {profile.name.split(" ").map((w) => <span key={w}><span>{w}</span></span>)}
          </h1>
          <div className="hero-meta">
            <p className="eyebrow">{profile.role} · {profile.location}</p>
            <p className="lede">{profile.tagline}</p>
            <button className="scroll-cue" onClick={() => go("about")}>Scroll to ride <em>↓</em></button>
          </div>
        </section>

        <section id="about" className="panel left">
          <div className="card" data-reveal>
            <p className="kicker">01 — About</p>
            <h2>Agents that do real work, in a field where it matters.</h2>
            <p>{profile.summary}</p>
            <div className="stats">
              {profile.stats.map((s) => <div key={s.label}><b>{s.value}</b><span>{s.label}</span></div>)}
            </div>
          </div>
        </section>

        <section id="experience" className="panel left">
          <div className="card wide" data-reveal>
            <p className="kicker">02 — Experience</p>
            <h2>HealthFoundry.ai</h2>
            {profile.experience.map((e) => (
              <article key={e.role} className="job">
                <header><h3>{e.role}</h3><span>{e.period}</span></header>
                <p className="muted">{e.company}</p>
                <ul>{e.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        <section id="skills" className="panel left">
          <div className="card wide" data-reveal>
            <p className="kicker">03 — Skills</p>
            <h2>The toolkit.</h2>
            <div className="skills">
              {profile.skills.map((g) => (
                <div key={g.group} className="skill-group">
                  <h4>{g.group}</h4>
                  <div className="chips">{g.items.map((i) => <span key={i}>{i}</span>)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="boat" className="boat">
          <p className="kicker">Next stop · the bay</p>
          <h2 className="boat-title"><span>We&apos;re taking</span> <span>the boat.</span></h2>
          <p className="boat-sub">Projects are moored across the water.</p>
        </section>

        <section id="projects" className="projects-sec">
          {profile.projects.map((p, i) => (
            <div key={p.title} className={`proj-row ${i % 2 ? "right" : "left"}`} data-project>
              <article className="card proj" data-reveal>
                <p className="kicker">04 — Project {String(i + 1).padStart(2, "0")}</p>
                <p className="muted">{p.kind}</p>
                <h3>{p.title}</h3>
                <p>{p.blurb}</p>
                <div className="chips small">{p.tags.map((t) => <span key={t}>{t}</span>)}</div>
              </article>
            </div>
          ))}
        </section>

        <section id="education" className="panel right edu">
          <div className="card" data-reveal>
            <p className="kicker">05 — Education</p>
            <h2>{profile.education.degree}</h2>
            <p className="muted">{profile.education.school} · {profile.education.period}</p>
            <p className="big">{profile.education.score}</p>
            <h4>Certifications</h4>
            <ul>{profile.certifications.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        </section>

        <section id="contact" className="panel center end">
          <Contact />
        </section>
      </main>
    </>
  );
}

function Contact() {
  const [copied, setCopied] = useState(false);
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(profile.email); }
    catch {
      const range = document.createRange();
      const el = document.getElementById("contact-email");
      if (el) { range.selectNodeContents(el); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="card contact" data-reveal>
      <p className="kicker">06 — Contact</p>
      <h2>Let&apos;s work together.</h2>
      <p>Open to roles and conversations in AI engineering, agent platforms and healthcare tech.</p>
      <div className="email-row">
        <a id="contact-email" className="email" href={`mailto:${profile.email}`}>{profile.email}</a>
        <button type="button" className="copy" onClick={copyEmail}>{copied ? "Copied" : "Copy email"}</button>
      </div>
      <div className="contact-actions">
        <a className="btn primary" href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn ↗</a>
        <a className="btn" href={profile.github} target="_blank" rel="noreferrer">GitHub ↗</a>
        {profile.resumeUrl && <a className="btn" href={profile.resumeUrl} target="_blank" rel="noreferrer">Résumé ↗</a>}
      </div>
      <p className="foot">© {new Date().getFullYear()} {profile.name}</p>
    </div>
  );
}
