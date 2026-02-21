export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function length(x, y) {
  return Math.sqrt(x * x + y * y);
}

export function normalize(x, y) {
  const len = length(x, y);
  if (len <= 0.00001) {
    return { x: 0, y: 0, len: 0 };
  }
  return { x: x / len, y: y / len, len };
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function choose(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function wrapAngle(angle) {
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
  return angle;
}
