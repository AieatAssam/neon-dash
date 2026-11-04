# Game Feel Research: Actionable Notes for a Geometry-Dash-Style Game

This note translates game design, animation, perception, and accessibility research into practical decisions for a fast, one-button precision platformer. Research findings are starting points for tuning, not universal laws: game feel is highly dependent on genre, timing, audiovisual style, and player preference.

## Visual direction: a continuous grid

TRON's designers describe a visual language built around emitted light and interactive geometric interfaces; its light-cycle trails connect the direction of travel to a persistent luminous form. [GMUNK on TRON: Legacy interfaces](https://inventinginteractive.com/2011/03/02/interview-gmunk/) · [ILM on light-cycle trails](https://www.ilm.com/tron-ares-david-seager-interview-ilm-vfx/)

For Neon Dash, apply that language with dark architectural silhouettes, crisp illuminated edges and a restrained halo. Background geometry should move as a continuous world, with stable identities as it scrolls; color changes should transition gradually. Trails should record the cube's actual path, not imitate motion at its current height. Keep the player and obstacles visually dominant over decoration. This is a design interpretation of the references, not a claim that any specific effect guarantees fun.

## 1. Fun, mastery, and challenge

The GameFlow model identifies concentration, challenge, player skill, control, clear goals, feedback, immersion, and social interaction as dimensions associated with enjoyment. For a short-run rhythm platformer, the most immediately actionable dimensions are clear goals, perceived control, rapid feedback, and a challenge that invites practice. Sweetser and Wyeth synthesize these as a design/evaluation model, not a formula that guarantees fun. [Sweetser & Wyeth, “GameFlow” (2005)](https://doi.org/10.1145/1077246.1077253)

**Implications**

- Keep the next actionable goal legible: show the upcoming hazard early enough to read, and use stable visual language for spikes, gaps, pads, portals, and checkpoints.
- Make input timing and jump behavior consistent. A player should attribute a miss to their timing, not to an unclear input window or inconsistent physics.
- Give immediate, specific evidence of action and outcome: jump onset, landing, progress, collision, and restart should each read clearly.
- Build challenge from learnable patterns and variation. Early play should teach the core timing; later sections can combine familiar patterns or tighten timing. A failure should reveal something the player can use on the next attempt.
- Treat flow as a hypothesis to tune, not a guaranteed result of “matching skill to difficulty.” The relationship varies by player and context; challenge can motivate mastery but can also frustrate or disengage.

A study of video-game flow found successful performance predicted greater flow in its tested shooting and medical simulation games. This supports making mastery and clear feedback visible, but does not establish an optimal difficulty curve for a rhythm platformer. [Keller & Bless, “Toward Integrative Models of Flow” (2012)](https://doi.org/10.1080/08838151.2012.678516)

## 2. Feedback and game feel

A broad survey frames game feel through three design intents: tuning physicality to make motion coherent and predictable; juicing/amplifying feedback to empower and clarify; and streamlining so player intent maps cleanly to action. The useful design question is not “how many effects can be added?” but “what does this effect communicate, and does it preserve control?” [Lim, Harrell & Zhang, “Designing Game Feel: A Survey” (2022)](https://doi.org/10.1109/TG.2021.3072241)

In a study of impact feedback in action games, the authors’ framework and comparative analysis highlighted hit stop, sound coherence, and camera control as features that may strongly affect impact feel. The authors examined games and player comments; this is evidence for useful dimensions to consider, not an isolated causal estimate of effect size. [Zhang et al., “What Features Influence Impact Feel?” (2022)](https://doi.org/10.1109/GEM56474.2022.10017782) · [Open preprint](https://arxiv.org/abs/2208.06155)

**Implications**

- Pair the most important events with coherent cues: a short, distinct sound and a restrained visual accent for jump, landing, collectible, death, and checkpoint. Ensure essential information remains available when audio is muted.
- Use a visual hierarchy: gameplay silhouettes and collision-relevant geometry must remain clearer than glow, particles, and decoration.
- Keep cues tied to causality. A flash or sound should occur because something happened, not as random continuous noise.
- Tune effect strength against precision. In a one-button game, the player must still judge the next landing during and immediately after effects.

## 3. Hit stop / freeze frames

Hit stop is a brief pause in the action around a strong impact. The impact-feel study above identifies it as a potentially important ingredient, but does not establish that it should be used on every collision or prescribe a universal duration.

**Implications**

- Consider a very short freeze on death or a major collectible/landing accent, then resume promptly into the death/restart flow. The freeze can make the event legible and weighty.
- Do not freeze the simulation during ordinary jumps or dense obstacle sequences: it can disrupt rhythm and make input feel unresponsive.
- If using hit stop, define precisely which clocks pause. Avoid pausing input/state transitions in a way that queues an accidental jump or delays restart. Keep the camera and HUD behavior intentional.
- Tune by comparison at actual game speed. A freeze that feels dramatic in isolation may feel like latency during repeated attempts.

## 4. Anticipation, timing, and animation

Anticipation is a classic animation principle: a preparatory cue helps an audience read what action is coming. It is a practitioner-derived animation principle rather than a game-specific controlled result. [Johnston & Thomas, *The Illusion of Life: Disney Animation* (1981)](https://books.google.com/books?id=9G4hAQAAIAAJ)

**Implications**

- Give the player enough approach distance and visual contrast to anticipate hazards. For predictable obstacles, their shape and placement should carry the warning; avoid relying on late surprise animation.
- Use anticipation on the avatar where it does not delay input: a tiny squash/lean at jump onset, then a clear extension and landing compression can add weight. The input response itself should remain immediate.
- Use easing for decorative transitions and short secondary motion for the cube, but keep the collision body and visible sprite aligned. Exaggeration that makes the sprite appear to clear a spike while the hitbox collides undermines trust.
- Keep animation timing consistent with the beat and physics. Avoid adding variable windup to a fixed-timing jump unless the mechanic explicitly teaches it.

## 5. Trails, glow, and “persistence of vision”

“Persistence of vision” is often used loosely to explain motion trails and animation. Vision research distinguishes several kinds of visual persistence and describes neural responses that can leave a waning trail for rapidly moving stimuli; this is not a simple universal mechanism that makes any drawn trail improve motion. [Coltheart, “The Persistences of Vision” (1980)](https://doi.org/10.1098/rstb.1980.0082) · [Burr & Ross, “Interactions between motion and form processing…” (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3657629/)

**Implications**

- Treat a rendered trail as an intentional design cue, not as a physiological requirement. A short, low-opacity trail can communicate speed and direction; it does not substitute for clear sprite motion or obstacle readability.
- Keep trails behind the player and fade them quickly. Avoid letting a bright trail cross or obscure upcoming collision geometry.
- Use glow with restraint: large bloom and high-contrast luminance pulses can wash out edges and reduce spatial precision. Preserve a crisp, high-contrast core for the player and hazards.
- Offer a reduced effects option that shortens/removes trails, bloom, camera shake, and particles while preserving gameplay cues.

## 6. Flashing and photosensitivity

W3C’s WCAG 2.1 Success Criterion 2.3.1 sets a safety threshold for general and red flashes, including limits on luminance/color transitions and flash area. W3C notes that content with no more than three flashes in any one-second period passes the simple frequency route, but this does not mean every pattern below that rate is comfortable for every person. The safest design choice is to avoid unnecessary flashing. [W3C: Understanding “Three Flashes or Below Threshold”](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html)

**Implications**

- Avoid rapid full-screen white/color inversions, strobe-like death bursts, and repeated high-contrast pulses, especially across a large portion of the viewport.
- Prefer a fade, expanding ring, particles with modest luminance, or a brief static color change for impacts and success.
- Ensure the game does not depend on flashing alone to indicate an important state; pair color changes with shape, position, iconography, or text.
- Provide a reduced motion/effects setting and honor the browser/OS `prefers-reduced-motion` preference where feasible. This is an additional comfort control, not a replacement for staying within flash thresholds.
- If a pulse is retained, evaluate the entire rendered viewport and the repeated sequence, including game-over/retry loops, not just one isolated animation.

## 7. Practical tuning checklist

1. **Control:** Does the avatar react immediately and predictably to the one-button input?
2. **Readability:** Can players identify the next hazard and their landing space without effects hiding it?
3. **Causality:** Can players tell why they died and what to adjust next attempt?
4. **Rhythm:** Do sounds, animation, camera, and effects support timing rather than compete with it?
5. **Intensity:** Are hit stop, shake, glow, trails, and particles strongest only for events that warrant emphasis?
6. **Accessibility:** Can a player reduce motion and effects? Are there no unnecessary rapid flashes or large-area luminance changes?
7. **Tuning evidence:** Compare variants in short play sessions and gather both performance evidence (deaths, completion, retries) and player reports (control, clarity, fatigue, satisfaction). Do not infer “fun” from one metric alone.

## Sources

- Sweetser, P. & Wyeth, P. (2005). [GameFlow: A model for evaluating player enjoyment in games](https://doi.org/10.1145/1077246.1077253). *Computers in Entertainment*, 3(3).
- Lim, Y., Harrell, D. F. & Zhang, Z. (2022). [Designing Game Feel: A Survey](https://doi.org/10.1109/TG.2021.3072241). *IEEE Transactions on Games*, 14(2), 138–152.
- Zhang, Z. et al. (2022). [What Features Influence Impact Feel? A Study of Impact Feedback in Action Games](https://doi.org/10.1109/GEM56474.2022.10017782). *IEEE GEM 2022*.
- Keller, J. & Bless, H. (2012). [“Toward Integrative Models of Flow”: Effects of Performance, Skill, Challenge, Playfulness, and Presence on Flow in Video Games](https://doi.org/10.1080/08838151.2012.678516). *Journal of Broadcasting & Electronic Media*, 56(2).
- Johnston, O. & Thomas, F. (1981). [The Illusion of Life: Disney Animation](https://books.google.com/books?id=9G4hAQAAIAAJ). Abbeville Press.
- Coltheart, M. (1980). [The Persistences of Vision](https://doi.org/10.1098/rstb.1980.0082). *Philosophical Transactions of the Royal Society B*, 290(1038), 57–69.
- Burr, D. & Ross, J. (2013). [Interactions between motion and form processing in the human visual system](https://pmc.ncbi.nlm.nih.gov/articles/PMC3657629/).
- W3C Web Accessibility Initiative. [Understanding WCAG 2.1 SC 2.3.1: Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html).
