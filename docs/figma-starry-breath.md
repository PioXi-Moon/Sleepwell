# SleepWell Figma Starfield Breathing Design

- Editable design: https://www.figma.com/design/S4agSBFr2UhudE2BIUnp1k?node-id=64-2
- Prototype: https://www.figma.com/proto/S4agSBFr2UhudE2BIUnp1k?node-id=64-2&starting-point-node-id=64%3A2
- Animation: `assets/animation/sleepwell-starry-breath-4-7-8.gif`
- Canvas: 390 x 844 pixels.
- Intended rhythm: inhale for 4 seconds, hold for 7 seconds, exhale for 8 seconds.

The animation blends two starfield textures and changes the breathing glow.
This commit provides the design reference and GIF asset; it does not change
the mini-program page implementation. The editable Figma document is hosted
on Figma and is not included as a `.fig` export.

The current GIF is a low-frame-rate design preview (3 fps). Production use
should implement continuous animation and synchronize the page controls with
the breathing state machine.
