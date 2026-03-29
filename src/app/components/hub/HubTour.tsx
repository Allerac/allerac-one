'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import * as userActions from '@/app/actions/user';

const STEPS_IDS = ['step1', 'step2', 'step3', 'step4'];

const PAD = 14;

export default function HubTour({ userId, onDone }: { userId: string; onDone: () => void }) {
  const t = useTranslations('hubTour');
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Build steps dynamically from translations
  const STEPS = [
    {
      id: 'welcome',
      title: t('step1Title'),
      body: t('step1Body'),
      targetId: null,
    },
    {
      id: 'domains',
      title: t('step2Title'),
      body: t('step2Body'),
      targetId: 'hub-icon-chat',
    },
    {
      id: 'start',
      title: t('step3Title'),
      body: t('step3Body'),
      targetId: 'hub-start-button',
    },
    {
      id: 'done',
      title: t('step4Title'),
      body: t('step4Body'),
      targetId: null,
    },
  ];

  const current = STEPS[step];

  const measureTarget = useCallback(() => {
    if (!current.targetId) { setRect(null); return; }
    const el = document.getElementById(current.targetId);
    if (el) setRect(el.getBoundingClientRect());
  }, [current.targetId]);

  useEffect(() => {
    measureTarget();
    window.addEventListener('resize', measureTarget);
    return () => window.removeEventListener('resize', measureTarget);
  }, [measureTarget]);

  const next = async () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      // Mark tour as complete if checkbox is checked
      if (dontShowAgain) {
        setIsSubmitting(true);
        await userActions.completeHubTour(userId);
        setIsSubmitting(false);
      }
      onDone();
    }
  };

  const handleSkip = async () => {
    if (dontShowAgain) {
      setIsSubmitting(true);
      await userActions.completeHubTour(userId);
      setIsSubmitting(false);
    }
    onDone();
  };

  const isLast = step === STEPS.length - 1;

  // Tooltip position
  let tooltipStyle: React.CSSProperties;
  if (!rect) {
    tooltipStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const panelH = 160;
    const spaceBelow = window.innerHeight - (rect.bottom + PAD + 8);
    if (spaceBelow >= panelH) {
      tooltipStyle = {
        position: 'fixed',
        top: rect.bottom + PAD + 8,
        left: Math.max(8, Math.min(rect.left - PAD, window.innerWidth - 308)),
      };
    } else {
      tooltipStyle = {
        position: 'fixed',
        top: Math.max(8, rect.top - PAD - panelH - 8),
        left: Math.max(8, Math.min(rect.left - PAD, window.innerWidth - 308)),
      };
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none' }}>
      {/* Overlay */}
      {rect ? (
        <div style={{
          position: 'absolute',
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)',
          borderRadius: 2,
        }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)' }} />
      )}

      {/* Tooltip panel */}
      <div style={{
        ...tooltipStyle,
        pointerEvents: 'auto',
        width: 300,
        background: '#c0c0c0',
        border: '2px solid',
        borderColor: '#ffffff #808080 #808080 #ffffff',
        boxShadow: '4px 4px 0 #000',
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
      }}>
        {/* Title bar */}
        <div style={{
          background: 'linear-gradient(90deg, #000080, #1084d0)',
          color: '#fff',
          padding: '5px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '9px' }}>
            {current.title}
          </span>
          <span style={{ fontSize: '10px', color: '#aad', fontFamily: 'Arial, sans-serif' }}>
            {t('stepCounter', { current: step + 1, total: STEPS.length })}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 14px 8px', color: '#000', lineHeight: 1.6 }}>
          {current.body}
        </div>

        {/* Checkbox */}
        <div style={{
          padding: '0 12px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <input
            type="checkbox"
            id="dont-show-again"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            disabled={isSubmitting}
            style={{ cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
          />
          <label htmlFor="dont-show-again" style={{
            fontSize: '11px',
            color: '#000',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.6 : 1,
          }}>
            {t('dontShowAgain')}
          </label>
        </div>

        {/* Buttons */}
        <div style={{
          padding: '0 12px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            onClick={handleSkip}
            disabled={isSubmitting}
            style={{
              background: '#c0c0c0',
              border: '2px solid',
              borderColor: '#ffffff #808080 #808080 #ffffff',
              padding: '3px 10px',
              fontSize: '11px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontFamily: 'Arial, sans-serif',
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            {t('skip')}
          </button>
          <button
            onClick={next}
            disabled={isSubmitting}
            style={{
              background: '#c0c0c0',
              border: '2px solid',
              borderColor: '#ffffff #808080 #808080 #ffffff',
              padding: '3px 16px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontFamily: 'Arial, sans-serif',
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            {isLast ? t('letsGo') : t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
