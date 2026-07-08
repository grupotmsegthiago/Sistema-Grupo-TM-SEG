import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser } from 'lucide-react';

interface Props {
  onChange: (dataUrl: string | null) => void;
  height?: number;
  className?: string;
}

const SignaturePad: React.FC<Props> = ({ onChange, height = 160, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return null;
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const width = parent?.clientWidth || 400;
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1e293b';
    }
  }, [height]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  const emitChange = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(hasStroke ? canvas.toDataURL('image/png') : null);
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pt = getPoint(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!pt || !ctx) return;
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pt = getPoint(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!pt || !ctx) return;
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    if (!hasStroke) setHasStroke(true);
  };

  const endDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    emitChange();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange(null);
  };

  return (
    <div className={className}>
      <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ height }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          data-testid="signature-pad-canvas"
        />
        {!hasStroke && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-slate-400 font-medium">
            Assine com o mouse ou dedo
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500 hover:text-slate-700"
        data-testid="button-clear-signature"
      >
        <Eraser size={12} /> Limpar assinatura
      </button>
    </div>
  );
};

export default SignaturePad;
