import { DayProfileInputs, DayProfileLabel, DayProfileResult } from '../types';

function classifyProfileLabel(bias: DayProfileInputs['bias'], lastPrice: number): DayProfileLabel {
  if (bias.bias === 'neutral') {
    return 'P3';
  }

  if (bias.bias.endsWith('-into-eq')) {
    return 'P2';
  }

  return 'P1';
}

function buildTargets(label: DayProfileLabel, bias: DayProfileInputs['bias']): { primary: string; secondary: string } {
  if (label === 'P1') {
    if (bias.bias.startsWith('long')) {
      return {
        primary: 'prior day high',
        secondary: 'prior session high'
      };
    }

    if (bias.bias.startsWith('short')) {
      return {
        primary: 'prior day low',
        secondary: 'prior session low'
      };
    }
  }

  if (label === 'P2') {
    if (bias.bias.startsWith('long')) {
      return {
        primary: 'current EQ retest',
        secondary: 'prior session low'
      };
    }

    if (bias.bias.startsWith('short')) {
      return {
        primary: 'current EQ retest',
        secondary: 'prior session high'
      };
    }
  }

  return {
    primary: 'prior day equilibrium',
    secondary: 'opposite session extreme'
  };
}

function buildRationale(label: DayProfileLabel, bias: DayProfileInputs['bias']): string[] {
  if (label === 'P1') {
    return [`${bias.structure.state} structure with price aligned to trend → expect directional expansion`];
  }

  if (label === 'P2') {
    return [`${bias.structure.state} structure but price away from EQ → anticipate rotation to equilibrium then continuation`];
  }

  return ['Mixed structure context → expect balanced profile targeting opposing liquidity'];
}

export function computeDayProfile(inputs: DayProfileInputs): DayProfileResult {
  const profileLabel = classifyProfileLabel(inputs.bias, inputs.lastPrice);
  const targets = buildTargets(profileLabel, inputs.bias);
  const rationale = buildRationale(profileLabel, inputs.bias);

  return {
    symbol: inputs.bias.symbol,
    asOf: inputs.bias.asOf,
    profile: profileLabel,
    sessionMap: inputs.sessionMap,
    targets,
    rationale
  };
}
