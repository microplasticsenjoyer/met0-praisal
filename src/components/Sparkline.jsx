import React from "react";
import styles from "./Sparkline.module.css";

// Tiny inline-SVG volume sparkline. Color encodes the trend (linear-regression
// slope across the window): green if rising, red if falling, neutral if flat.
//
//   <Sparkline values={[0, 12, 7, 18, 22, 30, 28]} width={64} height={18} />
export default function Sparkline({ values, width = 64, height = 18 }) {
  if (!values || values.length < 2) {
    return <span className={styles.empty}>—</span>;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const slope = linregSlope(values);
  const meanV = values.reduce((a, b) => a + b, 0) / values.length;
  const normalized = meanV > 0 ? slope / meanV : 0;

  let trendClass = styles.flat;
  if (normalized > 0.05) trendClass = styles.up;
  else if (normalized < -0.05) trendClass = styles.down;

  const last = values[values.length - 1];
  const lastX = (values.length - 1) * stepX;
  const lastY = height - 2 - ((last - min) / range) * (height - 4);

  return (
    <svg
      className={`${styles.spark} ${trendClass}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
      <circle cx={lastX} cy={lastY} r="1.6" fill="currentColor" />
    </svg>
  );
}

function linregSlope(values) {
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}
