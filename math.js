// Homografiya: tasvir (piksel) -> yo'l tekisligi (metr)
function solveH(src, dst) {
  const n = 8, A = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let k = i; k <= n; k++) A[r][k] -= f * A[i][k];
    }
  }
  const h = Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let k = i + 1; k < n; k++) s -= A[i][k] * h[k];
    h[i] = s / A[i][i];
  }
  return h;
}

function mapPoint(h, x, y) {
  const d = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
}

// Ko'p kadr bo'yicha chiziqli regressiya: X(t), Y(t) -> tezlik (km/soat)
function fitSpeed(s, k) {
  const n = s.length, t0 = s[0].t;
  const ts = s.map(p => (p.t - t0) / 1000);
  const mt = ts.reduce((a, b) => a + b) / n;
  const lin = key => {
    const m = s.reduce((a, p) => a + p[key], 0) / n;
    let sxy = 0, sxx = 0;
    s.forEach((p, i) => { sxy += (ts[i] - mt) * (p[key] - m); sxx += (ts[i] - mt) ** 2; });
    const b = sxx ? sxy / sxx : 0;
    return { b, a: m - b * mt };
  };
  const fx = lin('X'), fy = lin('Y');
  let r = 0;
  s.forEach((p, i) => { r += (p.X - fx.a - fx.b * ts[i]) ** 2 + (p.Y - fy.a - fy.b * ts[i]) ** 2; });
  const raw = Math.hypot(fx.b, fy.b) * 3.6;
  return { v: raw * k, raw, vy: fy.b, rms: Math.sqrt(r / n), n, dt: ts[n - 1] };
}
