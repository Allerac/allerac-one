'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import AlleracTaskbar from '@/app/components/layout/AlleracTaskbar';
import { useTheme } from '@/app/context/ThemeContext';

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  allowedDomains: string[];
}

type Sample = {
  area: number;
  rent: number;
  label: string;
};

const TRAINING_DATA: Sample[] = [
  { area: 35, rent: 1400, label: 'Studio distante' },
  { area: 42, rent: 1800, label: '1 quarto antigo' },
  { area: 50, rent: 2300, label: '1 quarto central' },
  { area: 58, rent: 2800, label: '2 quartos simples' },
  { area: 65, rent: 3400, label: '2 quartos renovado' },
  { area: 72, rent: 3900, label: '2 quartos bem localizado' },
  { area: 80, rent: 4100, label: '3 quartos longe' },
  { area: 90, rent: 5200, label: '3 quartos central' },
  { area: 105, rent: 6400, label: 'Apartamento amplo' },
  { area: 120, rent: 7000, label: 'Cobertura compacta' },
];

const AREA_MIN = 30;
const AREA_MAX = 125;
const RENT_MIN = 1000;
const RENT_MAX = 7400;
const INITIAL_WEIGHT = 0.15;
const INITIAL_BIAS = -0.3;

function normalizeArea(area: number) {
  return (area - AREA_MIN) / (AREA_MAX - AREA_MIN);
}

function normalizeRent(rent: number) {
  return (rent - RENT_MIN) / (RENT_MAX - RENT_MIN);
}

function denormalizeRent(value: number) {
  return value * (RENT_MAX - RENT_MIN) + RENT_MIN;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function money(value: number, locale: string) {
  return `R$ ${Math.round(value).toLocaleString(locale)}`;
}

function computeTrainingStep(weight: number, bias: number) {
  let loss = 0;
  let weightGradient = 0;
  let biasGradient = 0;

  for (const sample of TRAINING_DATA) {
    const x = normalizeArea(sample.area);
    const target = normalizeRent(sample.rent);
    const prediction = weight * x + bias;
    const error = prediction - target;

    loss += error * error;
    weightGradient += 2 * error * x;
    biasGradient += 2 * error;
  }

  return {
    loss: loss / TRAINING_DATA.length,
    weightGradient: weightGradient / TRAINING_DATA.length,
    biasGradient: biasGradient / TRAINING_DATA.length,
  };
}

function predictRent(weight: number, bias: number, area: number) {
  return denormalizeRent(weight * normalizeArea(area) + bias);
}

export default function LearnClient({ userId, userName, userEmail, isAdmin, allowedDomains }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('learn');
  const { isDark } = useTheme();
  const [weight, setWeight] = useState(INITIAL_WEIGHT);
  const [bias, setBias] = useState(INITIAL_BIAS);
  const [epoch, setEpoch] = useState(0);
  const [learningRate, setLearningRate] = useState(0.35);
  const [selectedArea, setSelectedArea] = useState(75);
  const [lossHistory, setLossHistory] = useState<number[]>(() => [computeTrainingStep(INITIAL_WEIGHT, INITIAL_BIAS).loss]);

  const step = useMemo(() => computeTrainingStep(weight, bias), [weight, bias]);
  const selectedPrediction = predictRent(weight, bias, selectedArea);
  const firstPoint = { x: AREA_MIN, y: predictRent(weight, bias, AREA_MIN) };
  const lastPoint = { x: AREA_MAX, y: predictRent(weight, bias, AREA_MAX) };
  const formatMoney = useCallback((value: number) => money(value, locale), [locale]);

  const handleLogout = useCallback(async () => {
    const { logout } = await import('@/app/actions/auth');
    await logout();
    router.push('/login');
  }, [router]);

  const runOneEpoch = () => {
    const current = computeTrainingStep(weight, bias);
    const nextWeight = weight - learningRate * current.weightGradient;
    const nextBias = bias - learningRate * current.biasGradient;
    const nextLoss = computeTrainingStep(nextWeight, nextBias).loss;

    setWeight(nextWeight);
    setBias(nextBias);
    setEpoch((value) => value + 1);
    setLossHistory((values) => [...values.slice(-59), nextLoss]);
  };

  const runManyEpochs = (count: number) => {
    let nextWeight = weight;
    let nextBias = bias;
    const nextHistory = [...lossHistory];

    for (let i = 0; i < count; i++) {
      const current = computeTrainingStep(nextWeight, nextBias);
      nextWeight -= learningRate * current.weightGradient;
      nextBias -= learningRate * current.biasGradient;
      nextHistory.push(computeTrainingStep(nextWeight, nextBias).loss);
    }

    setWeight(nextWeight);
    setBias(nextBias);
    setEpoch((value) => value + count);
    setLossHistory(nextHistory.slice(-60));
  };

  const reset = () => {
    setWeight(INITIAL_WEIGHT);
    setBias(INITIAL_BIAS);
    setEpoch(0);
    setLossHistory([computeTrainingStep(INITIAL_WEIGHT, INITIAL_BIAS).loss]);
  };

  return (
    <div className={isDark ? 'learn-page dark' : 'learn-page'}>
      <main className="learn-main">
        <section className="learn-stage" aria-label={t('trainingView')}>
          <div className="stage-header">
            <div>
              <p className="eyebrow">Learn</p>
              <h1>{t('title')}</h1>
            </div>
            <div className="epoch-pill">
              <span>{t('epoch')}</span>
              <strong>{epoch}</strong>
            </div>
          </div>

          <div className="chart-wrap">
            <svg className="chart" viewBox="0 0 760 430" role="img" aria-label={t('chartLabel')}>
              <defs>
                <linearGradient id="learn-grid" x1="0" x2="1">
                  <stop offset="0%" stopColor="#e5e7eb" />
                  <stop offset="100%" stopColor="#cbd5e1" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3, 4].map((i) => {
                const y = 40 + i * 78;
                return <line key={`h-${i}`} x1="72" x2="720" y1={y} y2={y} stroke="url(#learn-grid)" strokeWidth="1" />;
              })}
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const x = 72 + i * 129.6;
                return <line key={`v-${i}`} x1={x} x2={x} y1="40" y2="352" stroke="url(#learn-grid)" strokeWidth="1" />;
              })}
              <line x1="72" x2="720" y1="352" y2="352" stroke="#111827" strokeWidth="2" />
              <line x1="72" x2="72" y1="40" y2="352" stroke="#111827" strokeWidth="2" />
              <text x="76" y="388" className="axis-label">{AREA_MIN} m2</text>
              <text x="642" y="388" className="axis-label">{AREA_MAX} m2</text>
              <text x="16" y="352" className="axis-label">{formatMoney(RENT_MIN)}</text>
              <text x="16" y="48" className="axis-label">{formatMoney(RENT_MAX)}</text>

              <line
                x1={toChartX(firstPoint.x)}
                y1={toChartY(firstPoint.y)}
                x2={toChartX(lastPoint.x)}
                y2={toChartY(lastPoint.y)}
                stroke="#2563eb"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {TRAINING_DATA.map((sample) => {
                const predicted = predictRent(weight, bias, sample.area);
                return (
                  <g key={sample.label}>
                    <line
                      x1={toChartX(sample.area)}
                      x2={toChartX(sample.area)}
                      y1={toChartY(sample.rent)}
                      y2={toChartY(predicted)}
                      stroke="#ef4444"
                      strokeWidth="2"
                      strokeDasharray="5 5"
                    />
                    <circle cx={toChartX(sample.area)} cy={toChartY(sample.rent)} r="7" fill="#111827" />
                    <circle cx={toChartX(sample.area)} cy={toChartY(predicted)} r="5" fill="#2563eb" />
                  </g>
                );
              })}

              <circle cx={toChartX(selectedArea)} cy={toChartY(selectedPrediction)} r="9" fill="#16a34a" />
              <text x={toChartX(selectedArea) + 14} y={toChartY(selectedPrediction) - 10} className="selected-label">
                {formatMoney(selectedPrediction)}
              </text>
            </svg>
          </div>

          <div className="legend-row">
            <span><i className="dot real" /> {t('legendReal')}</span>
            <span><i className="dot predicted" /> {t('legendPredicted')}</span>
            <span><i className="line-error" /> {t('legendError')}</span>
          </div>
        </section>

        <aside className="learn-controls" aria-label={t('controls')}>
          <section className="control-section">
            <h2>{t('training')}</h2>
            <div className="metric-grid">
              <Metric label="Loss" value={step.loss.toFixed(5)} tone="blue" />
              <Metric label={t('weight')} value={weight.toFixed(3)} tone="green" />
              <Metric label="Bias" value={bias.toFixed(3)} tone="amber" />
            </div>
            <div className="button-row">
              <button type="button" onClick={runOneEpoch}>{t('oneEpoch')}</button>
              <button type="button" onClick={() => runManyEpochs(25)}>{t('manyEpochs')}</button>
              <button type="button" onClick={reset} className="secondary">{t('reset')}</button>
            </div>
            <label className="slider-label">
              {t('learningRate')}
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={learningRate}
                onChange={(event) => setLearningRate(Number(event.target.value))}
              />
              <span>{learningRate.toFixed(2)}</span>
            </label>
          </section>

          <section className="control-section">
            <h2>{t('testApartment')}</h2>
            <label className="slider-label">
              {t('area')}
              <input
                type="range"
                min="35"
                max="120"
                step="1"
                value={selectedArea}
                onChange={(event) => setSelectedArea(Number(event.target.value))}
              />
              <span>{selectedArea} m2</span>
            </label>
            <div className="prediction-box">
              <span>{t('predictedRent')}</span>
              <strong>{formatMoney(selectedPrediction)}</strong>
            </div>
          </section>

          <section className="control-section">
            <h2>{t('whatIsHappening')}</h2>
            <ol className="explain-list">
              <li>{t('step1')}</li>
              <li>{t('step2')}</li>
              <li>{t('step3')}</li>
              <li>{t('step4')}</li>
            </ol>
          </section>

          <section className="loss-section">
            <h2>{t('lossHistory')}</h2>
            <div className="loss-bars">
              {lossHistory.map((value, index) => {
                const max = Math.max(...lossHistory, 0.001);
                const height = clamp((value / max) * 100, 3, 100);
                return <span key={`${index}-${value}`} style={{ height: `${height}%` }} title={value.toFixed(5)} />;
              })}
            </div>
          </section>
        </aside>
      </main>

      <AlleracTaskbar
        domainKey="learn"
        domainName="Learn"
        domainIcon="🧠"
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        isAdmin={isAdmin}
        allowedDomains={allowedDomains}
        onLogout={handleLogout}
      />

      <style jsx>{`
        .learn-page {
          min-height: 100dvh;
          background: #f6f7f4;
          color: #111827;
          padding-bottom: 42px;
          font-family: Arial, Helvetica, sans-serif;
        }

        .learn-page.dark {
          background: #101214;
          color: #f8fafc;
        }

        .learn-main {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 390px;
          gap: 18px;
          height: calc(100dvh - 42px);
          padding: 18px;
        }

        .learn-stage,
        .learn-controls {
          min-height: 0;
          border: 1px solid rgba(17, 24, 39, 0.14);
          background: rgba(255, 255, 255, 0.86);
          box-shadow: 0 18px 60px rgba(15, 23, 42, 0.10);
        }

        .dark .learn-stage,
        .dark .learn-controls {
          border-color: rgba(248, 250, 252, 0.12);
          background: rgba(24, 28, 31, 0.92);
          box-shadow: none;
        }

        .learn-stage {
          display: flex;
          flex-direction: column;
          padding: 18px;
          overflow: hidden;
        }

        .stage-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 14px;
        }

        .eyebrow {
          margin: 0 0 4px;
          text-transform: uppercase;
          letter-spacing: 0;
          font-size: 12px;
          font-weight: 800;
          color: #2563eb;
        }

        h1,
        h2 {
          margin: 0;
          letter-spacing: 0;
        }

        h1 {
          font-size: 30px;
          line-height: 1.1;
        }

        h2 {
          font-size: 15px;
        }

        .epoch-pill {
          min-width: 112px;
          border: 1px solid rgba(37, 99, 235, 0.3);
          background: #eff6ff;
          padding: 10px 12px;
          display: grid;
          gap: 2px;
        }

        .dark .epoch-pill {
          background: rgba(37, 99, 235, 0.15);
        }

        .epoch-pill span {
          font-size: 11px;
          color: #64748b;
        }

        .epoch-pill strong {
          font-size: 24px;
        }

        .chart-wrap {
          flex: 1;
          min-height: 360px;
          border: 1px solid rgba(17, 24, 39, 0.12);
          background: #ffffff;
          overflow: hidden;
        }

        .dark .chart-wrap {
          background: #f8fafc;
        }

        .chart {
          width: 100%;
          height: 100%;
          display: block;
        }

        .axis-label,
        .selected-label {
          font-size: 14px;
          fill: #334155;
          font-weight: 700;
        }

        .selected-label {
          fill: #15803d;
        }

        .legend-row {
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
          padding-top: 12px;
          font-size: 13px;
          color: #475569;
        }

        .dark .legend-row {
          color: #cbd5e1;
        }

        .legend-row span {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .dot {
          width: 11px;
          height: 11px;
          display: inline-block;
          border-radius: 50%;
        }

        .dot.real {
          background: #111827;
        }

        .dot.predicted {
          background: #2563eb;
        }

        .line-error {
          width: 26px;
          border-top: 2px dashed #ef4444;
          display: inline-block;
        }

        .learn-controls {
          overflow-y: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .control-section,
        .loss-section {
          border: 1px solid rgba(17, 24, 39, 0.12);
          background: rgba(248, 250, 252, 0.72);
          padding: 14px;
        }

        .dark .control-section,
        .dark .loss-section {
          border-color: rgba(248, 250, 252, 0.12);
          background: rgba(15, 23, 42, 0.5);
        }

        .metric-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin: 12px 0;
        }

        .metric {
          min-width: 0;
          padding: 10px;
          border: 1px solid rgba(17, 24, 39, 0.10);
          background: #fff;
        }

        .dark .metric {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.10);
        }

        .metric span {
          display: block;
          color: #64748b;
          font-size: 11px;
          margin-bottom: 4px;
        }

        .metric strong {
          font-size: 14px;
          overflow-wrap: anywhere;
        }

        .metric.blue strong {
          color: #2563eb;
        }

        .metric.green strong {
          color: #16a34a;
        }

        .metric.amber strong {
          color: #b45309;
        }

        .button-row {
          display: grid;
          grid-template-columns: 1fr 1fr 0.8fr;
          gap: 8px;
        }

        button {
          min-height: 38px;
          border: 1px solid #1d4ed8;
          background: #2563eb;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }

        button.secondary {
          border-color: #94a3b8;
          background: #fff;
          color: #111827;
        }

        .dark button.secondary {
          background: #111827;
          color: #f8fafc;
        }

        .slider-label {
          display: grid;
          gap: 8px;
          margin-top: 12px;
          font-size: 13px;
          font-weight: 700;
        }

        input[type='range'] {
          width: 100%;
          accent-color: #2563eb;
        }

        .prediction-box {
          margin-top: 12px;
          display: grid;
          gap: 4px;
          padding: 14px;
          border: 1px solid rgba(22, 163, 74, 0.28);
          background: #f0fdf4;
        }

        .dark .prediction-box {
          background: rgba(22, 101, 52, 0.22);
        }

        .prediction-box span {
          color: #64748b;
          font-size: 12px;
        }

        .prediction-box strong {
          font-size: 24px;
          color: #15803d;
        }

        .explain-list {
          margin: 12px 0 0;
          padding-left: 20px;
          display: grid;
          gap: 8px;
          color: #475569;
          font-size: 13px;
          line-height: 1.35;
        }

        .dark .explain-list {
          color: #cbd5e1;
        }

        .loss-bars {
          height: 74px;
          display: flex;
          align-items: end;
          gap: 3px;
          padding-top: 12px;
        }

        .loss-bars span {
          flex: 1;
          min-width: 3px;
          background: linear-gradient(180deg, #ef4444, #f59e0b);
        }

        @media (max-width: 980px) {
          .learn-main {
            grid-template-columns: 1fr;
            height: auto;
            min-height: calc(100dvh - 42px);
          }

          .learn-controls {
            overflow: visible;
          }
        }

        @media (max-width: 620px) {
          .learn-main {
            padding: 10px;
            gap: 10px;
          }

          .learn-stage,
          .learn-controls {
            padding: 10px;
          }

          .stage-header {
            align-items: stretch;
            flex-direction: column;
          }

          h1 {
            font-size: 24px;
          }

          .chart-wrap {
            min-height: 310px;
          }

          .metric-grid,
          .button-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'amber' }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toChartX(area: number) {
  return 72 + ((area - AREA_MIN) / (AREA_MAX - AREA_MIN)) * 648;
}

function toChartY(rent: number) {
  const clamped = clamp(rent, RENT_MIN - 500, RENT_MAX + 500);
  return 352 - ((clamped - RENT_MIN) / (RENT_MAX - RENT_MIN)) * 312;
}
