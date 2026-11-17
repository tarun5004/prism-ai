import { useEffect, useRef } from 'react';
import './styles/cursor-cubes.css';

const paletteNames = ['coral', 'green', 'yellow', 'blue', 'orange', 'lilac'];

// One viewport-sized canvas for the homepage. Draw only while a particle is visible.
export default function CursorCubes() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas.parentElement;
    const palette = getComputedStyle(surface);
    const colors = paletteNames.map((name) => palette.getPropertyValue(`--accent-${name}`).trim());
    const context = canvas.getContext('2d');
    if (!context) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let particles = [];
    let frame = 0;
    let lastPoint = null;
    let colorIndex = 0;
    let width = 0;
    let height = 0;

    function resize() {
      clear();
      if (motion.matches) return;
      // Match the CSS viewport even when a classic scrollbar reserves some width.
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw(now) {
      frame = 0;
      context.clearRect(0, 0, width, height);
      particles = particles.filter((point) => now - point.born < 650);
      for (const point of particles) {
        const age = (now - point.born) / 650;
        const size = point.size * (1 - age * 0.5);
        const x = point.x;
        const y = point.y - age * 22;
        context.globalAlpha = (1 - age) * 0.8;
        context.fillStyle = point.color;
        context.beginPath();
        context.moveTo(x, y - size);
        context.lineTo(x + size, y - size / 2);
        context.lineTo(x, y);
        context.lineTo(x - size, y - size / 2);
        context.closePath();
        context.fill();
        context.globalAlpha *= 0.7;
        context.fillRect(x - size, y - size / 2, size, size);
        context.globalAlpha *= 0.7;
        context.fillRect(x, y - size / 2, size, size);
      }
      context.globalAlpha = 1;
      if (particles.length) frame = requestAnimationFrame(draw);
    }

    function move(event) {
      if (motion.matches || event.pointerType !== 'mouse') return;
      const point = { x: event.clientX, y: event.clientY };
      if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 12) return;
      lastPoint = point;
      particles.push({
        ...point,
        born: performance.now(),
        color: colors[colorIndex++ % colors.length],
        size: 5 + (colorIndex % 5),
      });
      particles = particles.slice(-24);
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function clear() {
      cancelAnimationFrame(frame);
      frame = 0;
      particles = [];
      lastPoint = null;
      context.clearRect(0, 0, width, height);
    }
    resize();
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', clear);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', clear, { passive: true, capture: true });
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    motion.addEventListener('change', resize);
    return () => {
      clear();
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', clear);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      motion.removeEventListener('change', resize);
    };
  }, []);
  return <canvas className="cursor-cubes" ref={canvasRef} aria-hidden="true" />;
}
