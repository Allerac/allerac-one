export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityFactors {
  explicitUrgency: PriorityLevel | null;
  ticketType: string;
  ageHours: number;
  creatorType: 'user' | 'agent';
  keywordSignals: string[];
}

export interface PriorityInput {
  explicitUrgency?: PriorityLevel | null;
  ticketType: string;
  createdAt: Date;
  creatorType: 'user' | 'agent';
  title: string;
  description?: string | null;
}

export interface PriorityResult {
  score: number;
  level: PriorityLevel;
  factors: PriorityFactors;
}

const URGENCY_KEYWORDS = ['crash', 'down', 'urgent', 'breaking', 'critical', 'broken', 'error', 'fail', 'blocker'];

const TYPE_BASE_SCORES: Record<string, number> = {
  bug: 60,
  improvement: 45,
  task: 50,
  question: 35,
};

export class TicketPriorityService {
  levelFromScore(score: number): PriorityLevel {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  scoreFromExplicit(urgency: PriorityLevel | null): number {
    switch (urgency) {
      case 'critical': return 100;
      case 'high':     return 75;
      case 'medium':   return 50;
      case 'low':      return 25;
      default:         return 50;
    }
  }

  compute(input: PriorityInput): PriorityResult {
    const ageHours = (Date.now() - input.createdAt.getTime()) / (1000 * 60 * 60);
    const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
    const keywordSignals = URGENCY_KEYWORDS.filter(kw => text.includes(kw));

    // Weights: explicit 40% | type 10% | age 20% | creator 10% | keywords 20%
    const explicitContrib  = this.scoreFromExplicit(input.explicitUrgency ?? null) * 0.4;
    const typeContrib      = (TYPE_BASE_SCORES[input.ticketType] ?? 50) * 0.1;
    const ageContrib       = Math.min(ageHours / 72, 1) * 100 * 0.2; // caps at 72h
    const creatorContrib   = (input.creatorType === 'agent' ? 60 : 50) * 0.1;
    const keywordContrib   = Math.min(keywordSignals.length * 30, 100) * 0.2;

    const score = Math.round(
      Math.min(100, explicitContrib + typeContrib + ageContrib + creatorContrib + keywordContrib)
    );

    return {
      score,
      level: this.levelFromScore(score),
      factors: {
        explicitUrgency: input.explicitUrgency ?? null,
        ticketType: input.ticketType,
        ageHours: Math.round(ageHours * 10) / 10,
        creatorType: input.creatorType,
        keywordSignals,
      },
    };
  }
}

export const ticketPriorityService = new TicketPriorityService();
