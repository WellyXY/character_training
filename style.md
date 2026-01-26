# Parrot Frontend Style Guide

This document summarizes the current visual language (colors, typography, common components) observed in the frontend.

## Colors
- **Background / Foreground:** `#000000` / `#ffffff`
- **Primary:** `#ffffff` (text on dark), primary foreground `#000000`
- **Secondary:** `#414141` (text white)
- **Surfaces:** card `#111111`, border `#333333`
- **Accent gray:** `#cbcbcb`
- Transparency is used heavily for overlays and cards (`bg-white/5`, `border-white/10`, gradients, blur).

## Typography
- **Sans (body):** `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif`
- **Mono (headings / UI / code-like text):** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
- **Weights & casing:** Frequent use of bold, uppercase, wide tracking for buttons/nav labels.

### Common sizes
- Hero heading: 5xl–8xl, bold, tracking-tighter, white.
- Hero subhead: lg–xl, gray-400, mono, relaxed leading.
- Nav/Buttons: text-xs or text-sm, bold, mono, uppercase, tracking-wide/widest.
- Body copy: lg–xl in hero; elsewhere mono gray-400.

## Layout & Components
- **Navbar:** Fixed top; `bg-black/50` with `backdrop-blur-md`, `border-b #333`. Nav links: text-xs, bold, mono, uppercase, gray-400 → white on hover. CTA: white bg / black text, rounded-md; label “Contact Us”.
- **Hero:** Black background with faint grid. Centered container, text-center. Primary CTA “Contact Us” (white bg), secondary “Live Avatar” (dark bg with border). Avatar embed card: `bg-white/5`, `border-white/10`, `rounded-3xl`, height ~620px; grid split ~1.1:1 for video vs controls.
- **Buttons (general):** Rounded (md–lg), bold, mono uppercase. Light variant: white bg / black text, hover gray. Dark variant: `bg-[#1a1a1a]` / white text / border `#333`, hover darker.
- **Cards / Panels:** Dark surfaces with subtle borders and gradients, `shadow-2xl`, occasional blur (`glass-panel`).
- **Background utilities:** `grid-bg` (40px grid with subtle lines), gradients on hero and live-embed.

## Effects
- Framer Motion for fade/slide-in on hero text and CTAs.
- Hover states on links/buttons; subtle shadows on cards.
- Chat/scrollable areas use `overflow-y-auto`, constrained height within rounded, bordered containers.

## Spacing & Alignment
- Hero: generous top padding (`pt-32`), large margins (`mb-8`, `mb-12`), max widths (`max-w-5xl` headings, `max-w-2xl` subhead).
- Avatar embed wrapper: max width 5xl with padding (p-6/7 inside), rounded corners, and balanced two-column layout on large screens, single column on mobile.

## CTA Copy
- Primary CTA: “Contact Us” (was “Get Access”).
- Secondary CTA: “Live Avatar”.

## Notes
- Fonts avoid external fetch (no next/font/google) for build reliability.
- Colors favor high-contrast dark theme with subtle translucency and gradients.
- If adding new components, follow the dark-on-black base, white/gray text hierarchy, bold mono for UI labels, and consistent rounded borders with light borders/overlays.*** End Patch

