"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: "top" | "bottom";
}

export function Tooltip({ content, children, position = "top" }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show && triggerRef.current && tooltipRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tipRect = tooltipRef.current.getBoundingClientRect();
      let x = rect.left + rect.width / 2 - tipRect.width / 2;
      let y = position === "top" ? rect.top - tipRect.height - 6 : rect.bottom + 6;

      // Keep within viewport
      if (x < 8) x = 8;
      if (x + tipRect.width > window.innerWidth - 8) x = window.innerWidth - tipRect.width - 8;
      if (y < 8) y = rect.bottom + 6; // flip to bottom

      setCoords({ x, y });
    }
  }, [show, position]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="inline-flex"
      >
        {children}
      </div>
      {show && (
        <div
          ref={tooltipRef}
          className="fixed z-[100] px-3 py-2 text-xs bg-gray-900 text-white rounded-lg shadow-lg pointer-events-none animate-in fade-in duration-150"
          style={{ left: coords.x, top: coords.y }}
        >
          {content}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 ${
              position === "top" ? "-bottom-1" : "-top-1"
            }`}
          />
        </div>
      )}
    </>
  );
}
