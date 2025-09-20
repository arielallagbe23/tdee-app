// app/api/calc/route.ts
import { NextRequest, NextResponse } from "next/server";

type Body = {
  gender: "male" | "female";
  age: number;       // ans
  height: number;    // cm
  weight: number;    // kg
  activity: "sedentary" | "light" | "moderate" | "intense" | "very_intense";
};

const activityFactor: Record<Body["activity"], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  intense: 1.725,
  very_intense: 1.9,
};

function round(n: number) {
  return Math.round(n);
}

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as Body;

    // Validation simple
    if (!data || !data.gender || !data.age || !data.height || !data.weight || !data.activity)
      return NextResponse.json({ error: "Champs manquants." }, { status: 400 });

    if (data.age < 10 || data.age > 100) return NextResponse.json({ error: "Âge incohérent." }, { status: 400 });
    if (data.height < 120 || data.height > 230) return NextResponse.json({ error: "Taille incohérente." }, { status: 400 });
    if (data.weight < 30 || data.weight > 250) return NextResponse.json({ error: "Poids incohérent." }, { status: 400 });

    // Mifflin-St Jeor (kcal/jour)
    const BMR =
      data.gender === "male"
        ? 10 * data.weight + 6.25 * data.height - 5 * data.age + 5
        : 10 * data.weight + 6.25 * data.height - 5 * data.age - 161;

    const TDEE = BMR * activityFactor[data.activity];

    return NextResponse.json({
      bmr: round(BMR),
      tdee: round(TDEE),
    });
  } catch (e) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}
