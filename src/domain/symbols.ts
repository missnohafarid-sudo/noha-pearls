export type SymbolGroupId = 'math' | 'powers' | 'science';

export interface SymbolGroup {
  id: SymbolGroupId;
  symbols: readonly string[];
}

/** The mathematical and scientific symbols the slide editor offers, grouped as its palette shows them. */
export const SYMBOL_GROUPS: readonly SymbolGroup[] = [
  { id: 'math', symbols: ['×', '÷', '±', '−', '=', '≠', '≈', '≤', '≥', '<', '>', '√', '∞', 'π', '%', '°'] },
  { id: 'powers', symbols: ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁺', '⁻', '₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'] },
  { id: 'science', symbols: ['°C', '°F', '→', '←', '⇌', '↑', '↓', 'Δ', 'α', 'β', 'γ', 'θ', 'λ', 'μ', 'ρ', 'σ', 'ω', 'Ω', '·'] },
];
