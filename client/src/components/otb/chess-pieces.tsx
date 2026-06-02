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

function WhiteKnight() {
  return (
    <g fill="none" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M 22 10 C 32.5 11 38.5 23 34 29 C 34 29 30.5 26.5 28 26.5 C 27 26.5 26 26.5 25 27 L 17.5 27 C 16 27 14.5 28 14.5 30 L 14.5 33.5 C 14.5 35.5 12.5 36 11 35.5 L 9 34 C 8 33 8 30.5 8.5 29 C 9 26 11 21 11 21 C 9.5 20 8.5 18.5 8.5 17 C 8.5 15 10.5 12.5 11.5 12 C 12.5 11.5 13.5 10.5 15 10 C 17.5 9 20 9.5 22 10 Z"
        fill="#ffffff"
      />
      <path d="M 24 18 C 24.38 20.91 18.45 25.37 16 27 C 13 29 13.18 31.34 11 31 C 9.958 30.06 12.41 27.96 11 28 C 10 28 11.19 29.23 10 30 C 9 30 5.997 31 6 26 C 6 24 8 20 8 18 C 8 16 6.5 15 5 14" />
      <circle cx="9" cy="18" r="0.5" fill="#000000" strokeWidth="1" />
      <path
        d="M 24.55 10.4 L 24.1 11.85 L 24.6 12 C 27.75 13 30.25 14.49 32.5 18.75 C 34.75 23.01 35.75 29.06 35.25 34.05 L 35.02 36 L 36.25 36 L 38.29 36 L 38.36 33.7 C 38.49 29.01 37.3 19.5 32.79 14.3 C 30.3 11.46 27.5 10.5 24.55 10.4 Z"
        fill="#ffffff"
        stroke="none"
      />
    </g>
  );
}

function BlackKnight() {
  return (
    <g fill="none" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M 22 10 C 32.5 11 38.5 23 34 29 C 34 29 30.5 26.5 28 26.5 C 27 26.5 26 26.5 25 27 L 17.5 27 C 16 27 14.5 28 14.5 30 L 14.5 33.5 C 14.5 35.5 12.5 36 11 35.5 L 9 34 C 8 33 8 30.5 8.5 29 C 9 26 11 21 11 21 C 9.5 20 8.5 18.5 8.5 17 C 8.5 15 10.5 12.5 11.5 12 C 12.5 11.5 13.5 10.5 15 10 C 17.5 9 20 9.5 22 10 Z"
        fill="#000000"
        stroke="#000000"
      />
      <path
        d="M 24 18 C 24.38 20.91 18.45 25.37 16 27 C 13 29 13.18 31.34 11 31 C 9.958 30.06 12.41 27.96 11 28 C 10 28 11.19 29.23 10 30 C 9 30 5.997 31 6 26 C 6 24 8 20 8 18 C 8 16 6.5 15 5 14"
        stroke="#ffffff"
      />
      <circle cx="9" cy="18" r="0.5" fill="#ffffff" strokeWidth="1.5" stroke="#ffffff" />
      <path
        d="M 24.55 10.4 L 24.1 11.85 L 24.6 12 C 27.75 13 30.25 14.49 32.5 18.75 C 34.75 23.01 35.75 29.06 35.25 34.05 L 35.02 36 L 36.25 36 L 38.29 36 L 38.36 33.7 C 38.49 29.01 37.3 19.5 32.79 14.3 C 30.3 11.46 27.5 10.5 24.55 10.4 Z"
        fill="#ffffff"
        stroke="none"
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
      <path
        d="M 14 16.5 L 11 14 L 34 14 L 31 16.5 Z"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path
        d="M 11 14 L 11 9 L 15 9 L 15 11 L 20 11 L 20 9 L 25 9 L 25 11 L 30 11 L 30 9 L 34 9 L 34 14 Z"
        strokeLinecap="butt"
      />
      <path
        d="M 12 35.5 L 33 35.5"
        fill="none"
        strokeLinejoin="miter"
      />
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
      <path
        d="M 14 16.5 L 11 14 L 34 14 L 31 16.5 Z"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
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
