import React from 'react';
import type { PieceSymbol } from 'chess.js';

interface ChessPieceProps {
  color: 'w' | 'b';
  type: PieceSymbol;
  className?: string;
}

// cburnett piece set — MIT license, originally from Lichess (lichess-org/lila)
// viewBox: 0 0 45 45

function WhitePawn() {
  return (
    <>
      <path
        d="M 22.5 9 C 20.29 9 18.5 10.79 18.5 13 C 18.5 13.89 18.79 14.71 19.28 15.38 C 17.33 16.5 16 18.59 16 21 C 16 23.03 16.94 24.84 18.41 26.03 C 15.41 27.09 11 31.58 11 39.5 L 34 39.5 C 34 31.58 29.59 27.09 26.59 26.03 C 28.06 24.84 29 23.03 29 21 C 29 18.59 27.67 16.5 25.72 15.38 C 26.21 14.71 26.5 13.89 26.5 13 C 26.5 10.79 24.71 9 22.5 9 Z"
        fill="#ffffff"
        stroke="#000000"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  );
}

function BlackPawn() {
  return (
    <>
      <path
        d="M 22.5 9 C 20.29 9 18.5 10.79 18.5 13 C 18.5 13.89 18.79 14.71 19.28 15.38 C 17.33 16.5 16 18.59 16 21 C 16 23.03 16.94 24.84 18.41 26.03 C 15.41 27.09 11 31.58 11 39.5 L 34 39.5 C 34 31.58 29.59 27.09 26.59 26.03 C 28.06 24.84 29 23.03 29 21 C 29 18.59 27.67 16.5 25.72 15.38 C 26.21 14.71 26.5 13.89 26.5 13 C 26.5 10.79 24.71 9 22.5 9 Z"
        fill="#000000"
        stroke="#000000"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  );
}

// cburnett knight paths — from lichess-org/lila (MIT licence)
function WhiteKnight() {
  return (
    <g
      fill="none"
      fillRule="evenodd"
      stroke="#000"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    >
      <path fill="#fff" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
      <path
        fill="#fff"
        d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"
      />
      <path
        fill="#000"
        d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5"
      />
    </g>
  );
}

function BlackKnight() {
  return (
    <g
      fill="none"
      fillRule="evenodd"
      stroke="#000"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    >
      <path fill="#000" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
      <path
        fill="#000"
        d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-1-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-2 2.5-3c1 0 1 3 1 3"
      />
      <path
        fill="#ececec"
        stroke="#ececec"
        d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.43-9.75a.5 1.5 30 1 1-.86-.5.5 1.5 30 1 1 .86.5"
      />
      <path
        fill="#ececec"
        stroke="none"
        d="m24.55 10.4-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34s-5.79-6.64-9.19-7.16z"
      />
    </g>
  );
}

function WhiteBishop() {
  return (
    <g
      fill="none"
      fillRule="evenodd"
      stroke="#000000"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g fill="#ffffff" strokeLinecap="butt">
        <path d="M 9 36 C 12.39 35.03 19.11 36.43 22.5 34 C 25.89 36.43 32.61 35.03 36 36 C 36 36 37.65 36.54 39 38 C 38.32 38.97 37.2 38.99 36 38.5 C 32.61 37.53 25.89 38.96 22.5 37.5 C 19.11 38.96 12.39 37.53 9 38.5 C 7.8 38.99 6.68 38.97 6 38 C 7.35 36.54 9 36 9 36 Z" />
        <path d="M 15 32 C 17.5 34.5 27.5 34.5 30 32 C 30.5 30.5 30 30 30 30 C 30 27.5 27.5 26 27.5 26 C 33 24.5 33.5 14.5 22.5 10.5 C 11.5 14.5 12 24.5 17.5 26 C 17.5 26 15 27.5 15 30 C 15 30 14.5 30.5 15 32 Z" />
        <path d="M 25 8 A 2.5 2.5 0 1 1 20 8 A 2.5 2.5 0 1 1 25 8 Z" />
      </g>
      <path
        d="M 17.5 26 L 27.5 26 M 15 30 L 30 30 M 22.5 15.5 L 22.5 20.5 M 20 18 L 25 18"
        strokeLinejoin="miter"
      />
    </g>
  );
}

function BlackBishop() {
  return (
    <g
      fill="none"
      fillRule="evenodd"
      stroke="#000000"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g fill="#000000" strokeLinecap="butt">
        <path d="M 9 36 C 12.39 35.03 19.11 36.43 22.5 34 C 25.89 36.43 32.61 35.03 36 36 C 36 36 37.65 36.54 39 38 C 38.32 38.97 37.2 38.99 36 38.5 C 32.61 37.53 25.89 38.96 22.5 37.5 C 19.11 38.96 12.39 37.53 9 38.5 C 7.8 38.99 6.68 38.97 6 38 C 7.35 36.54 9 36 9 36 Z" />
        <path d="M 15 32 C 17.5 34.5 27.5 34.5 30 32 C 30.5 30.5 30 30 30 30 C 30 27.5 27.5 26 27.5 26 C 33 24.5 33.5 14.5 22.5 10.5 C 11.5 14.5 12 24.5 17.5 26 C 17.5 26 15 27.5 15 30 C 15 30 14.5 30.5 15 32 Z" />
        <path d="M 25 8 A 2.5 2.5 0 1 1 20 8 A 2.5 2.5 0 1 1 25 8 Z" />
      </g>
      <path
        d="M 17.5 26 L 27.5 26 M 15 30 L 30 30 M 22.5 15.5 L 22.5 20.5 M 20 18 L 25 18"
        stroke="#ffffff"
        strokeLinejoin="miter"
      />
    </g>
  );
}

function WhiteRook() {
  return (
    <g
      fill="#ffffff"
      fillRule="evenodd"
      stroke="#000000"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M 9 39 L 36 39 L 36 36 L 9 36 L 9 39 Z"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path
        d="M 12.5 32 L 14 29.5 L 31 29.5 L 32.5 32 L 12.5 32 Z"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path
        d="M 12 36 L 12 32 L 33 32 L 33 36 L 12 36 Z"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path d="M 14 29.5 L 14 16.5 L 31 16.5 L 31 29.5 L 14 29.5 Z" strokeLinecap="butt" />
      <path d="M 14 16.5 L 11 14 L 34 14 L 31 16.5 Z" strokeLinecap="butt" strokeLinejoin="miter" />
      <path
        d="M 11 14 L 11 9 L 15 9 L 15 11 L 20 11 L 20 9 L 25 9 L 25 11 L 30 11 L 30 9 L 34 9 L 34 14 Z"
        strokeLinecap="butt"
      />
      <path d="M 12 35.5 L 33 35.5" fill="none" strokeLinejoin="miter" />
    </g>
  );
}

function BlackRook() {
  return (
    <g
      fill="#000000"
      fillRule="evenodd"
      stroke="#000000"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M 9 39 L 36 39 L 36 36 L 9 36 L 9 39 Z"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path
        d="M 12.5 32 L 14 29.5 L 31 29.5 L 32.5 32 L 12.5 32 Z"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path
        d="M 12 36 L 12 32 L 33 32 L 33 36 L 12 36 Z"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path d="M 14 29.5 L 14 16.5 L 31 16.5 L 31 29.5 L 14 29.5 Z" strokeLinecap="butt" />
      <path d="M 14 16.5 L 11 14 L 34 14 L 31 16.5 Z" strokeLinecap="butt" strokeLinejoin="miter" />
      <path
        d="M 11 14 L 11 9 L 15 9 L 15 11 L 20 11 L 20 9 L 25 9 L 25 11 L 30 11 L 30 9 L 34 9 L 34 14 Z"
        strokeLinecap="butt"
      />
      <path d="M 12 35.5 L 33 35.5" fill="none" stroke="#ffffff" strokeLinejoin="miter" />
      <path
        d="M 13 31.5 L 32 31.5 M 14 29.5 L 31 29.5 M 14 16.5 L 31 16.5 M 11 14 L 34 14"
        fill="none"
        stroke="#ffffff"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
    </g>
  );
}

function WhiteQueen() {
  return (
    <g
      fill="#ffffff"
      fillRule="evenodd"
      stroke="#000000"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M 9 26 C 17.5 24.5 30 24.5 36 26 L 38.5 13.5 L 31 25 L 30.7 10.9 L 22.5 24.5 L 14.3 10.9 L 14 25 L 6.5 13.5 Z" />
      <path d="M 9 26 C 9 28 10.5 28 11.5 30 C 12.5 31.5 12.5 31 12 33.5 C 10.5 34.5 10.5 36 10.5 36 C 9 37.5 11 38.5 11 38.5 C 17.5 39.5 27.5 39.5 34 38.5 C 34 38.5 36 37.5 34.5 36 C 34.5 36 34.5 34.5 33 33.5 C 32.5 31 32.5 31.5 33.5 30 C 34.5 28 36 28 36 26 C 27.5 24.5 17.5 24.5 9 26 Z" />
      <path d="M 11.5 30 C 15 29 30 29 33.5 30" fill="none" />
      <path d="M 12 33.5 C 15 32.5 30 32.5 33 33.5" fill="none" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="14" cy="9" r="2" />
      <circle cx="22.5" cy="8" r="2" />
      <circle cx="31" cy="9" r="2" />
      <circle cx="39" cy="12" r="2" />
    </g>
  );
}

function BlackQueen() {
  return (
    <g
      fill="#000000"
      fillRule="evenodd"
      stroke="#000000"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M 9 26 C 17.5 24.5 30 24.5 36 26 L 38.5 13.5 L 31 25 L 30.7 10.9 L 22.5 24.5 L 14.3 10.9 L 14 25 L 6.5 13.5 Z" />
      <path d="M 9 26 C 9 28 10.5 28 11.5 30 C 12.5 31.5 12.5 31 12 33.5 C 10.5 34.5 10.5 36 10.5 36 C 9 37.5 11 38.5 11 38.5 C 17.5 39.5 27.5 39.5 34 38.5 C 34 38.5 36 37.5 34.5 36 C 34.5 36 34.5 34.5 33 33.5 C 32.5 31 32.5 31.5 33.5 30 C 34.5 28 36 28 36 26 C 27.5 24.5 17.5 24.5 9 26 Z" />
      <path d="M 11.5 30 C 15 29 30 29 33.5 30" fill="none" stroke="#ffffff" />
      <path d="M 12 33.5 C 15 32.5 30 32.5 33 33.5" fill="none" stroke="#ffffff" />
      <circle cx="6" cy="12" r="2" fill="#ffffff" stroke="#ffffff" />
      <circle cx="14" cy="9" r="2" fill="#ffffff" stroke="#ffffff" />
      <circle cx="22.5" cy="8" r="2" fill="#ffffff" stroke="#ffffff" />
      <circle cx="31" cy="9" r="2" fill="#ffffff" stroke="#ffffff" />
      <circle cx="39" cy="12" r="2" fill="#ffffff" stroke="#ffffff" />
    </g>
  );
}

function WhiteKing() {
  return (
    <g
      fill="none"
      fillRule="evenodd"
      stroke="#000000"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M 22.5 11.63 L 22.5 6" strokeLinejoin="miter" />
      <path d="M 20 8 L 25 8" strokeLinejoin="miter" />
      <path
        d="M 22.5 25 C 22.5 25 27 17.5 25.5 14.5 C 25.5 14.5 24.5 12 22.5 12 C 20.5 12 19.5 14.5 19.5 14.5 C 18 17.5 22.5 25 22.5 25"
        fill="#ffffff"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path
        d="M 11.5 37 C 17 40.5 27 40.5 33 37 L 33 30 C 33 30 41.5 25.5 38.5 19.5 C 34.5 13 25 16 22.5 23.5 L 22.5 27 L 22.5 23.5 C 19.5 15.5 10 13 6.5 19.5 C 3.5 25.5 11.5 29.5 11.5 29.5 L 11.5 37"
        fill="#ffffff"
      />
      <path d="M 11.5 30 C 17 27 27 27 33 30" />
      <path d="M 11.5 33.5 C 17 30.5 27 30.5 33 33.5" />
      <path d="M 11.5 37 C 17 34 27 34 33 37" />
    </g>
  );
}

function BlackKing() {
  return (
    <g
      fill="none"
      fillRule="evenodd"
      stroke="#000000"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M 22.5 11.63 L 22.5 6" strokeLinejoin="miter" stroke="#ffffff" />
      <path d="M 20 8 L 25 8" strokeLinejoin="miter" stroke="#ffffff" />
      <path
        d="M 22.5 25 C 22.5 25 27 17.5 25.5 14.5 C 25.5 14.5 24.5 12 22.5 12 C 20.5 12 19.5 14.5 19.5 14.5 C 18 17.5 22.5 25 22.5 25"
        fill="#000000"
        stroke="#ffffff"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path
        d="M 11.5 37 C 17 40.5 27 40.5 33 37 L 33 30 C 33 30 41.5 25.5 38.5 19.5 C 34.5 13 25 16 22.5 23.5 L 22.5 27 L 22.5 23.5 C 19.5 15.5 10 13 6.5 19.5 C 3.5 25.5 11.5 29.5 11.5 29.5 L 11.5 37"
        fill="#000000"
        stroke="#ffffff"
      />
      <path d="M 11.5 30 C 17 27 27 27 33 30" stroke="#ffffff" />
      <path d="M 11.5 33.5 C 17 30.5 27 30.5 33 33.5" stroke="#ffffff" />
      <path d="M 11.5 37 C 17 34 27 34 33 37" stroke="#ffffff" />
    </g>
  );
}

const PIECE_COMPONENTS: Record<'w' | 'b', Record<PieceSymbol, () => React.ReactElement>> = {
  w: {
    p: WhitePawn,
    n: WhiteKnight,
    b: WhiteBishop,
    r: WhiteRook,
    q: WhiteQueen,
    k: WhiteKing,
  },
  b: {
    p: BlackPawn,
    n: BlackKnight,
    b: BlackBishop,
    r: BlackRook,
    q: BlackQueen,
    k: BlackKing,
  },
};

export default function ChessPiece({ color, type, className }: ChessPieceProps) {
  const PieceComponent = PIECE_COMPONENTS[color][type];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 45 45"
      width="100%"
      height="100%"
      className={className}
      aria-hidden="true"
    >
      <PieceComponent />
    </svg>
  );
}
