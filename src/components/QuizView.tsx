"use client";

import { useState } from "react";

import type { Quiz } from "@/lib/types";

export function QuizView({ quiz }: { quiz: Quiz }) {
  // questionIndex → chosen option index. Answers are final once given, the way
  // they would be in a real quiz.
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [showChallenge, setShowChallenge] = useState(false);

  const answered = Object.keys(chosen).length;
  const correct = quiz.mcq.filter((q, i) => chosen[i] === q.answerIndex).length;

  return (
    <section data-testid="quiz" className="mt-12 border-t border-rule pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-parchment">Test yourself</h2>
        <p className="font-mono text-xs text-muted tabular-nums">
          {answered}/{quiz.mcq.length} answered
          {answered > 0 && (
            <span className={correct === answered ? "text-cyan" : "text-amber"}>
              {" "}
              · {correct} correct
            </span>
          )}
        </p>
      </header>

      <ol className="mt-6 flex flex-col gap-7">
        {quiz.mcq.map((question, qi) => {
          const pick = chosen[qi];
          const isAnswered = pick !== undefined;

          return (
            <li key={qi}>
              <p className="flex gap-3 text-[15px] leading-relaxed text-parchment">
                <span className="font-mono text-xs text-muted tabular-nums">
                  {String(qi + 1).padStart(2, "0")}
                </span>
                <span>{question.question}</span>
              </p>

              <div className="mt-2.5 ml-8 flex flex-col gap-1.5">
                {question.options.map((option, oi) => {
                  const isRight = oi === question.answerIndex;
                  const isPick = pick === oi;

                  // Before answering: neutral. After: the right one is always
                  // marked, so a wrong pick still teaches the correct answer.
                  let tone = "border-rule text-parchment/80 hover:border-muted";
                  if (isAnswered && isRight) tone = "border-cyan bg-cyan/10 text-parchment";
                  else if (isAnswered && isPick) tone = "border-rust bg-rust/10 text-parchment";
                  else if (isAnswered) tone = "border-rule/50 text-muted";

                  return (
                    <button
                      key={oi}
                      type="button"
                      data-testid="mcq-option"
                      disabled={isAnswered}
                      onClick={() => setChosen((prev) => ({ ...prev, [qi]: oi }))}
                      className={`flex items-start gap-2.5 border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${tone}`}
                    >
                      <span className="font-mono text-xs text-muted">
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className="flex-1">{option}</span>
                      {isAnswered && isRight && (
                        <span className="font-mono text-xs text-cyan">correct</span>
                      )}
                      {isAnswered && isPick && !isRight && (
                        <span className="font-mono text-xs text-rust">your answer</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {isAnswered && (
                <p className="rise mt-2 ml-8 border-l-2 border-amber/60 bg-panel px-3 py-2 font-reading text-sm leading-relaxed text-parchment/75">
                  {question.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <h3 className="mt-10 font-display text-xl text-parchment">Short answers</h3>
      <ol className="mt-4 flex flex-col gap-4">
        {quiz.short.map((item, si) => (
          <li key={si}>
            <p className="text-[15px] leading-relaxed text-parchment">{item.question}</p>
            {revealed[si] ? (
              <p className="rise mt-1.5 border-l-2 border-cyan/60 bg-panel px-3 py-2 font-reading text-sm leading-relaxed text-parchment/80">
                {item.answer}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setRevealed((prev) => ({ ...prev, [si]: true }))}
                className="mt-1.5 font-mono text-xs uppercase tracking-widest text-cyan hover:underline"
              >
                Show answer
              </button>
            )}
          </li>
        ))}
      </ol>

      <h3 className="mt-10 font-display text-xl text-parchment">Coding challenge</h3>
      <p className="mt-3 text-[15px] leading-relaxed text-parchment/90">{quiz.challenge.task}</p>
      <p className="mt-2 font-reading text-sm text-muted">Hint: {quiz.challenge.hint}</p>

      {showChallenge ? (
        <pre className="rise mt-3 overflow-x-auto border border-rule border-l-2 border-l-cyan bg-[#080b12] px-4 py-3">
          <code className="font-mono text-[13px] leading-relaxed text-parchment/85">
            {quiz.challenge.solution}
          </code>
        </pre>
      ) : (
        <button
          type="button"
          onClick={() => setShowChallenge(true)}
          className="mt-3 border border-rule px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted transition-colors hover:border-cyan hover:text-cyan"
        >
          Show solution
        </button>
      )}
    </section>
  );
}
