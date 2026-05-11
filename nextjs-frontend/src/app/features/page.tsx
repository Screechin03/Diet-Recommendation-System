import Link from "next/link";

const features = [
  {
    title: "Pregnancy-safe recipe recommendations",
    description:
      "Creates diet-aware recipe suggestions from pregnancy profile, ingredients, and restrictions.",
  },
  {
    title: "Dietary restriction filtering",
    description:
      "Filters vegan, vegetarian, dairy-free, gluten-free, and nut-free meals before recommendations are returned.",
  },
  {
    title: "Pregnancy risk analytics",
    description:
      "Uses the health-risk endpoint to assess pregnancy-related risk and return a human-readable explanation.",
  },
  {
    title: "Prescription report reader",
    description:
      "Uploads a prescription or lab report, extracts structured details, and generates diet guidance.",
  },
  {
    title: "Saved recipes and history",
    description:
      "Supports account-based recipe saving and recommendation history in the Next.js frontend.",
  },
  {
    title: "Backend proxy routes",
    description:
      "Frontend API routes proxy requests to the FastAPI service so the browser does not call the backend directly.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">
          Product features
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              What this project provides
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
              These are the public capabilities exposed through the deployed frontend and its FastAPI backend.
            </p>
          </div>
          <Link
            href="/docs"
            className="rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            View request formats
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 transition hover:-translate-y-0.5 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
            >
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}