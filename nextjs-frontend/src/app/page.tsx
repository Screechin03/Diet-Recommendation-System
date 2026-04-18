import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-3xl font-semibold tracking-tight">
          Pregnancy Nutrition Guide
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
          Personalized pregnancy-safe recipe recommendations and ML-powered pregnancy risk insights.
          This frontend talks to the existing FastAPI backend.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Link
            href="/diet-planner"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold">Diet Planner</div>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Enter your pregnancy profile and get recommended recipes with benefits.
            </div>
          </Link>
          <Link
            href="/recipe-finder"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold">Custom Recipe Finder</div>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Add ingredients + restrictions; the backend filters unsafe foods.
            </div>
          </Link>
          <Link
            href="/health-analytics"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold">Health Analytics</div>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Run pregnancy risk assessment and view model performance.
            </div>
          </Link>

          <Link
            href="/signup"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold">Create account</div>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Sign up to keep your recipes saved in your own account.
            </div>
          </Link>
          <Link
            href="/saved-recipes"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold">Saved recipes</div>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              View all recipes you bookmarked from recommendation results.
            </div>
          </Link>
          <Link
            href="/history"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold">Recommendation history</div>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Review recipes from your previous planner/finder searches.
            </div>
          </Link>
        </div>

        <div className="mt-8 text-xs text-zinc-600 dark:text-zinc-400">
          Backend expected at <span className="font-mono">http://localhost:8080</span> (configurable via environment variables).
        </div>
      </div>
    </div>
  );
}
