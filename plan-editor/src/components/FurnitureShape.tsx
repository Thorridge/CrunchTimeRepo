import { Circle, Group, Line, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Furniture } from '../furniture';
import { shade } from '../color';

/*
 * Symboles de mobilier vus de dessus (coordonnées locales, centrées).
 * x le long de la largeur, y le long de la profondeur ; l'avant est du côté +y.
 */
type Props = {
  item: Furniture;
  scale: number;
  selected?: boolean;
  ghost?: boolean;
  isSelectTool?: boolean;
  onSelect?: () => void;
  onMouseDown?: (e: KonvaEventObject<MouseEvent>) => void;
  onHover?: (on: boolean) => void;
};

export function FurnitureShape({ item, scale, selected, ghost, isSelectTool, onSelect, onMouseDown, onHover }: Props) {
  const { width: w, depth: d, color } = item;
  const line = shade(color, -0.35);
  const detail = shade(color, -0.15);
  const sw = 1 / scale;

  return (
    <Group
      x={item.x}
      y={item.y}
      rotation={item.rotation}
      opacity={ghost ? 0.55 : 1}
      listening={!ghost}
      onClick={(e) => {
        if (!isSelectTool) return;
        e.cancelBubble = true;
        onSelect?.();
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <Rect
        x={-w / 2} y={-d / 2} width={w} height={d}
        fill={color}
        stroke={selected ? '#D8232A' : line}
        strokeWidth={(selected ? 2.5 : 1.2) * sw}
        cornerRadius={item.type === 'table' ? Math.min(w, d) * 0.08 : 3}
        shadowColor="#0F172A" shadowOpacity={ghost ? 0 : 0.12} shadowBlur={6 * sw} shadowOffsetY={2 * sw}
      />
      <Details item={item} line={line} detail={detail} sw={sw} />
    </Group>
  );
}

function Details({ item, line, detail, sw }: { item: Furniture; line: string; detail: string; sw: number }) {
  const { width: w, depth: d } = item;
  switch (item.type) {
    case 'kitchen': {
      // Évier à gauche, plaque de cuisson à droite, bord de plan de travail à l'avant.
      const r = Math.min(d * 0.12, 9);
      return (
        <>
          <Line points={[-w / 2, d / 2 - 4, w / 2, d / 2 - 4]} stroke={line} strokeWidth={sw} />
          <Rect x={-w / 4 - 22} y={-d / 2 + 10} width={44} height={d - 26} cornerRadius={6}
            fill="#E2E8F0" stroke={line} strokeWidth={sw} />
          <Circle x={-w / 4} y={-d / 2 + 14} radius={2.5} fill={line} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => (
            <Circle key={`${i}${j}`} x={w / 4 + i * 14} y={j * 12 - 2} radius={r} stroke={line} strokeWidth={sw * 1.2} />
          ))}
        </>
      );
    }
    case 'fridge':
      return (
        <>
          <Line points={[-w / 2, d / 2 - 8, w / 2, d / 2 - 8]} stroke={line} strokeWidth={sw} />
          <Line points={[w / 2 - 12, d / 2 - 4, w / 2 - 4, d / 2 - 4]} stroke={line} strokeWidth={sw * 2} lineCap="round" />
          <Line points={[-w / 2 + 6, -d / 2 + 6, w / 2 - 6, d / 2 - 14]} stroke={detail} strokeWidth={sw} dash={[4 * sw, 3 * sw]} />
        </>
      );
    case 'table':
      return <Rect x={-w / 2 + 6} y={-d / 2 + 6} width={w - 12} height={d - 12} stroke={detail} strokeWidth={sw} cornerRadius={4} />;
    case 'chair':
      return (
        <>
          <Rect x={-w / 2} y={-d / 2} width={w} height={d * 0.22} fill={line} cornerRadius={2} />
          <Rect x={-w / 2 + 4} y={-d / 2 + d * 0.3} width={w - 8} height={d * 0.62} stroke={detail} strokeWidth={sw} cornerRadius={4} />
        </>
      );
    case 'sofa': {
      const back = d * 0.25;
      const arm = Math.min(w * 0.1, 20);
      const seatW = w - 2 * arm;
      const n = Math.max(1, Math.round(seatW / 70));
      return (
        <>
          <Rect x={-w / 2} y={-d / 2} width={w} height={back} fill={detail} cornerRadius={4} />
          <Rect x={-w / 2} y={-d / 2} width={arm} height={d} fill={detail} cornerRadius={4} />
          <Rect x={w / 2 - arm} y={-d / 2} width={arm} height={d} fill={detail} cornerRadius={4} />
          {Array.from({ length: n - 1 }, (_, i) => {
            const x = -w / 2 + arm + ((i + 1) * seatW) / n;
            return <Line key={i} points={[x, -d / 2 + back, x, d / 2 - 4]} stroke={line} strokeWidth={sw} />;
          })}
        </>
      );
    }
    case 'tv':
      return (
        <>
          <Rect x={-w * 0.42} y={-d / 2 + 4} width={w * 0.84} height={6} fill="#0F172A" cornerRadius={2} />
          <Line points={[0, -d / 2 + 10, 0, -d / 2 + 16]} stroke="#0F172A" strokeWidth={sw * 3} />
        </>
      );
    case 'bed': {
      const pw = w / 2 - 14;
      return (
        <>
          <Rect x={-w / 2} y={-d / 2} width={w} height={8} fill={line} cornerRadius={2} />
          <Rect x={-w / 2 + 8} y={-d / 2 + 14} width={pw} height={30} fill="#FFFFFF" stroke={detail} strokeWidth={sw} cornerRadius={8} />
          <Rect x={6} y={-d / 2 + 14} width={pw} height={30} fill="#FFFFFF" stroke={detail} strokeWidth={sw} cornerRadius={8} />
          <Rect x={-w / 2 + 3} y={-d / 2 + 54} width={w - 6} height={d - 57} fill={detail} opacity={0.35} cornerRadius={4} />
          <Line points={[-w / 2 + 3, -d / 2 + 80, w / 2 - 3, -d / 2 + 80]} stroke={line} strokeWidth={sw} />
        </>
      );
    }
  }
}
