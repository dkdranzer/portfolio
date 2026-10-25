# Dinesh Kumar G — Ride-through Portfolio

A scroll-driven portfolio: a rider on a motorbike cruises through a sunset city,
and each section of the site (About, Experience, Skills, Projects, Education,
Contact) has its own landmark on the route.

Stack (per the Premium Website Workflow guide): **Next.js + React, Three.js,
GSAP + ScrollTrigger, Lenis**.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

## Edit your content

Everything you'd want to change is in **`src/content/profile.ts`** — name,
summary, experience, skills, projects, links, and the section order.
Billboard text in the 3D city is at the top of `src/components/Portfolio.tsx`.

## Use a cinematic AI video instead of the live 3D city (optional)

For the photoreal look from the reference reel, generate a ride-through clip
(Higgsfield / Kling: "first-person chase shot behind a motorcyclist riding
through a European city at golden hour, smooth camera, 10 seconds"), then:

1. Re-encode it so it scrubs smoothly on scroll (every frame a keyframe):
   ```bash
   ffmpeg -i ride-raw.mp4 -vf scale=1920:-2 -c:v libx264 -g 1 -crf 23 -an public/ride.mp4
   ```
2. In `src/content/profile.ts` set `rideVideo: "/ride.mp4"`.

Scrolling now plays the video forward/backward; all sections stay the same.

## Deploy

Push to GitHub and import the repo on https://vercel.com — no config needed.

## Where things live

| File | What it does |
| --- | --- |
| `src/content/profile.ts` | All text content and section order |
| `src/lib/rideScene.ts` | The Three.js city, rider, camera moves per section |
| `src/components/Portfolio.tsx` | Page layout, Lenis smooth scroll, GSAP reveals, HUD |
| `src/app/globals.css` | Styling |
| `public/Dinesh_Kumar_Resume.pdf` | Résumé linked from the contact section |
