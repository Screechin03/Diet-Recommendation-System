import Link from "next/link";

const endpoints = [
  {
    method: "POST",
    path: "/predict/",
    purpose: "Pregnancy-safe recipe recommendations",
    request: `{
  "pregnancy_info": {
    "pregnancy_month": 4,
    "age": 28,
    "pre_pregnancy_weight": 60,
    "current_weight": 64,
    "height": 165,
    "has_gestational_diabetes": false,
    "has_anemia": false,
    "has_morning_sickness": false,
    "has_heartburn": false,
    "has_constipation": false,
    "medications": [],
    "food_aversions": [],
    "food_cravings": [],
    "dietary_restrictions": ["Vegetarian"],
    "activity_level": "moderate"
  },
  "ingredients": ["spinach", "lentils"],
  "params": {
    "n_neighbors": 5,
    "return_distance": false
  }
}`,
  },
  {
    method: "POST",
    path: "/predict_pregnancy_risk",
    purpose: "Pregnancy risk assessment",
    request: `{
  "health_data": {
    "age": 29,
    "systolic_bp": 118,
    "diastolic_bp": 76,
    "blood_sugar": 6.8,
    "body_temp": 98.4,
    "bmi": 23.1,
    "heart_rate": 74,
    "previous_complications": false,
    "preexisting_diabetes": false,
    "gestational_diabetes": false,
    "mental_health_issues": false,
    "smoking_history": false,
    "alcohol_consumption": "none",
    "exercise_frequency": "moderate",
    "sleep_hours": 8,
    "stress_level": "low"
  }
}`,
  },
  {
    method: "GET",
    path: "/model_performance",
    purpose: "Model status and diagnostics",
    request: "No body required.",
  },
  {
    method: "POST",
    path: "/batch_risk_assessment",
    purpose: "Risk assessment for multiple patients",
    request: `[
  {
    "age": 29,
    "systolic_bp": 118,
    "diastolic_bp": 76,
    "blood_sugar": 6.8,
    "body_temp": 98.4,
    "bmi": 23.1,
    "heart_rate": 74,
    "previous_complications": false,
    "preexisting_diabetes": false,
    "gestational_diabetes": false,
    "mental_health_issues": false,
    "smoking_history": false,
    "alcohol_consumption": "none",
    "exercise_frequency": "moderate",
    "sleep_hours": 8,
    "stress_level": "low"
  }
]`,
  },
  {
    method: "POST",
    path: "/prescription_report",
    purpose: "Upload a report and generate diet guidance",
    request: `multipart/form-data fields:
- file: PDF/image upload
- dietary_preferences: vegetarian | vegan | etc.
- allergies: comma-separated text
- goals: free-form text
- include_diet_plan: true | false`,
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-3xl border border-zinc-200 bg-linear-to-br from-white via-zinc-50 to-emerald-50 p-8 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-emerald-950/30">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">
          API docs
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Request formats for the deployed backend
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
              These payloads match the FastAPI endpoints used by the frontend and the Render deployment.
            </p>
          </div>
          <Link
            href="/features"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            View features
          </Link>
        </div>

        <div className="mt-8 space-y-4">
          {endpoints.map((endpoint) => (
            <section
              key={endpoint.path}
              className="rounded-2xl border border-zinc-200 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-950/70"
            >
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-zinc-950 px-3 py-1 font-semibold text-white dark:bg-white dark:text-zinc-950">
                  {endpoint.method}
                </span>
                <span className="font-mono text-zinc-700 dark:text-zinc-200">{endpoint.path}</span>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {endpoint.purpose}
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-sm text-zinc-100 dark:border-zinc-800">
                <pre className="whitespace-pre-wrap wrap-break-word font-mono leading-6">{endpoint.request}</pre>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}