"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, ensureAnonAuth, FIREBASE_AVAILABLE } from "./lib/firebaseClient";

type Gender = "male" | "female";
type Activity = "sedentary" | "light" | "moderate" | "intense" | "very_intense";

type FormState = {
  gender: Gender;
  age: string; // cm/kg/age gardés en string tant que l'utilisateur saisit
  height: string;
  weight: string;
  activity: Activity;
  save: boolean;
  deficit: string; // kcal/j
};

type CalcResponse = { bmr: number; tdee: number };

const ACTIVITIES: Array<{ value: Activity; label: string; desc: string }> = [
  { value: "sedentary", label: "Sédentaire", desc: "Peu ou pas de sport" },
  { value: "light", label: "Léger", desc: "1–3 séances / sem." },
  { value: "moderate", label: "Modéré", desc: "3–5 séances / sem." },
  { value: "intense", label: "Intense", desc: "6–7 séances / sem." },
  { value: "very_intense", label: "Très intense", desc: "Travail + sport" },
];

const STORAGE_KEY = "tdee-form-v2";

const DEFAULT_FORM: FormState = {
  gender: "male",
  age: "",
  height: "",
  weight: "",
  activity: "sedentary",
  save: false,
  deficit: "750",
};

export default function Home() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onChange = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // ---- URL <-> Form helpers (pour lien de reprise)
  function formToQuery(f: FormState) {
    const p = new URLSearchParams();
    p.set("g", f.gender);
    if (f.age) p.set("age", f.age);
    if (f.height) p.set("h", f.height);
    if (f.weight) p.set("w", f.weight);
    p.set("act", f.activity);
    if (f.deficit) p.set("d", f.deficit);
    return p.toString();
  }
  function queryToForm(qs: string): Partial<FormState> {
    const q = new URLSearchParams(qs);
    const g = q.get("g") as Gender | null;
    const act = q.get("act") as Activity | null;
    return {
      gender: g === "male" || g === "female" ? g : undefined,
      age: q.get("age") ?? undefined,
      height: q.get("h") ?? undefined,
      weight: q.get("w") ?? undefined,
      activity: (
        [
          "sedentary",
          "light",
          "moderate",
          "intense",
          "very_intense",
        ] as Activity[]
      ).includes(act as Activity)
        ? (act as Activity)
        : undefined,
      deficit: q.get("d") ?? undefined,
    };
  }
  async function copyShareLink() {
    const base =
      typeof window !== "undefined"
        ? window.location.origin + window.location.pathname
        : "";
    const url = `${base}?${formToQuery(form)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Impossible de copier le lien.");
    }
  }

  const targetCalories = useMemo(() => {
    if (!result) return null;
    const d = Math.max(0, Math.min(2000, Number(form.deficit || 0)));
    return Math.max(0, Math.round(result.tdee - d));
  }, [result, form.deficit]);

  function validate(): string | null {
    const age = Number(form.age);
    const height = Number(form.height);
    const weight = Number(form.weight);
    const deficit = Number(form.deficit);
    if (!age || !height || !weight) return "Merci de remplir tous les champs.";
    if (age < 10 || age > 100) return "Âge incohérent (10–100).";
    if (height < 120 || height > 230) return "Taille incohérente (120–230 cm).";
    if (weight < 30 || weight > 250) return "Poids incohérent (30–250 kg).";
    if (isNaN(deficit) || deficit < 0 || deficit > 2000)
      return "Déficit entre 0 et 2000 kcal.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        gender: form.gender,
        age: Number(form.age),
        height: Number(form.height),
        weight: Number(form.weight),
        activity: form.activity,
      };

      const res = await fetch("/api/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur inconnue");

      setResult(data as CalcResponse);

      if (form.save && FIREBASE_AVAILABLE && db) {
        const user = await ensureAnonAuth();
        const deficit = Math.max(0, Math.min(2000, Number(form.deficit || 0)));
        await addDoc(collection(db, "tdee_results"), {
          uid: user.uid,
          ...payload,
          deficit,
          bmr: (data as CalcResponse).bmr,
          tdee: (data as CalcResponse).tdee,
          target: Math.max(
            0,
            Math.round((data as CalcResponse).tdee - deficit)
          ),
          createdAt: serverTimestamp(),
        });
      }
    } catch (err: any) {
      setError(err?.message || "Impossible de calculer.");
    } finally {
      setLoading(false);
    }
  }

  // ---- Chargement initial : d’abord URL, sinon localStorage
  useEffect(() => {
    try {
      const fromUrl = queryToForm(
        typeof window !== "undefined" ? window.location.search : ""
      );
      const hasUrl = Object.values(fromUrl).some(Boolean);
      if (hasUrl) {
        setForm((p) => ({ ...p, ...fromUrl }));
        return;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setForm((p) => ({ ...p, ...(JSON.parse(raw) as FormState) }));
    } catch {}
  }, []);
  // ---- Sauvegarde locale automatique
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {}
  }, [form]);

  const reset = () => {
    setForm(DEFAULT_FORM);
    setResult(null);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0B1220] to-[#0A0F1A] text-slate-100 px-4 py-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">
          Calculateur de calories (TDEE)
        </h1>

        <form onSubmit={handleSubmit} className="mt-5 space-y-6" noValidate>
          {/* Sexe */}
          <div>
            <span className="block text-sm text-slate-400 mb-2">Sexe</span>
            <div className="grid grid-cols-2 gap-2">
              {(["male", "female"] as Gender[]).map((g) => {
                const active = form.gender === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onChange("gender", g)}
                    className={[
                      "rounded-2xl px-4 py-3 text-base font-medium border transition",
                      active
                        ? "bg-sky-500 text-white border-sky-500 shadow-sm"
                        : "bg-[#0F1A2C] text-slate-100 border-[#1B2A44] hover:border-slate-500/40",
                    ].join(" ")}
                    aria-pressed={active}
                  >
                    {g === "male" ? "Homme" : "Femme"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activité */}
          <div>
            <span className="block text-sm text-slate-400 mb-2">Activité</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACTIVITIES.map((a) => {
                const active = form.activity === a.value;
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => onChange("activity", a.value)}
                    className={[
                      "text-left rounded-2xl border p-4 transition",
                      active
                        ? "bg-sky-900/40 border-sky-600"
                        : "bg-[#0F1A2C] border-[#1B2A44] hover:border-slate-500/40",
                    ].join(" ")}
                    aria-pressed={active}
                  >
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs text-slate-400">{a.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <LabeledNumber
              label="Âge"
              unit="ans"
              min={10}
              max={100}
              placeholder="28"
              value={form.age}
              onChange={(v) => onChange("age", v)}
            />
            <LabeledNumber
              label="Taille"
              unit="cm"
              min={120}
              max={230}
              placeholder="175"
              value={form.height}
              onChange={(v) => onChange("height", v)}
            />
            <LabeledNumber
              label="Poids"
              unit="kg"
              min={30}
              max={250}
              placeholder="70"
              value={form.weight}
              onChange={(v) => onChange("weight", v)}
            />
          </div>

          {/* Déficit calorique */}
          <div className="rounded-2xl border border-[#1B2A44] bg-[#0F1A2C] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-300">Déficit calorique</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={10}
                  value={form.deficit}
                  onChange={(e) => onChange("deficit", e.target.value)}
                  className="w-24 rounded-lg px-2 py-1 text-right bg-[#0C1626] border border-[#1B2A44] focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
                <span className="text-sm text-slate-400">kcal/j</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={Number(form.deficit || 0)}
              onChange={(e) =>
                onChange("deficit", String(Number(e.target.value)))
              }
              className="w-full accent-sky-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0</span>
              <span>1000</span>
              <span>2000</span>
            </div>
          </div>

          {/* Options “sans BDD” */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <button
              type="button"
              onClick={copyShareLink}
              className="rounded-lg border border-[#1B2A44] bg-[#0F1A2C] px-3 py-2 hover:border-slate-500/40"
            >
              📎 Copier le lien de reprise
            </button>
            {copied && <span className="text-sky-300">Lien copié ✅</span>}
          </div>

          {/* (Optionnel) Enregistrement Firestore */}
          {FIREBASE_AVAILABLE && (
            <label className="flex items-center gap-3 select-none">
              <input
                type="checkbox"
                className="h-5 w-5 accent-sky-500"
                checked={form.save}
                onChange={(e) => onChange("save", e.target.checked)}
              />
              <span className="text-sm text-slate-300">
                Enregistrer aussi dans Firestore
              </span>
            </label>
          )}

          {/* CTA sticky mobile */}
          <div className="sticky bottom-[env(safe-area-inset-bottom)] z-10">
            <div className="bg-gradient-to-t from-[#0A0F1A] to-transparent h-6 -mb-1 pointer-events-none" />
            <div className="grid grid-cols-2 gap-2 bg-[#0A0F1A]/80 backdrop-blur p-2 rounded-2xl border border-[#1B2A44] shadow-sm">
              <button
                type="button"
                onClick={reset}
                className="rounded-xl px-4 py-3 font-medium border border-[#1B2A44] text-slate-100 hover:bg-[#0F1A2C]"
              >
                Réinitialiser
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl px-4 py-3 font-medium bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-60"
              >
                {loading ? "Calcul…" : "Calculer"}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <p
            className="mt-4 text-rose-300 bg-rose-900/20 border border-rose-700/40 rounded-xl px-3 py-2 text-sm"
            role="alert"
          >
            {error}
          </p>
        )}

        {result && (
          <div className="mt-5 rounded-2xl border border-[#1B2A44] bg-[#0F1A2C] p-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="BMR (repos)" value={`${result.bmr} kcal/j`} />
              <Stat
                label="TDEE (maintien)"
                value={`${result.tdee} kcal/j`}
                big
              />
              <Stat
                label="Déficit choisi"
                value={`${Math.max(
                  0,
                  Math.min(2000, Number(form.deficit || 0))
                )} kcal/j`}
              />
              <Stat
                label="Objectif (TDEE − déficit)"
                value={
                  targetCalories !== null ? `${targetCalories} kcal/j` : "—"
                }
                big
              />
            </div>
            {targetCalories !== null && targetCalories < 1200 && (
              <p className="text-xs text-amber-300 mt-3">
                ⚠️ Objectif très bas. Vérifie que cela reste adapté à toi.
              </p>
            )}
            <p className="text-xs text-slate-400 mt-2">
              Formule Mifflin-St Jeor + facteur d’activité.
            </p>
          </div>
        )}
      </div>

      {loading && (
        <div className="fixed inset-0 grid place-items-center bg-black/20">
          <div className="h-10 w-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
      )}
    </main>
  );
}

function LabeledNumber(props: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  placeholder?: string;
}) {
  const { label, unit, value, onChange, min, max, placeholder } = props;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="relative">
        <input
          className="w-full rounded-xl border border-[#1B2A44] bg-[#0F1A2C] text-slate-100 placeholder:text-slate-500 p-3 pr-12 focus:outline-none focus:ring-2 focus:ring-sky-600"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
        />
        <span className="absolute inset-y-0 right-3 flex items-center text-sm text-slate-400 select-none">
          {unit}
        </span>
      </div>
    </label>
  );
}

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div
        className={[
          "font-extrabold tracking-tight",
          big ? "text-3xl" : "text-2xl",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
