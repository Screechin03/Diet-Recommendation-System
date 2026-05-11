import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-white via-zinc-50 to-emerald-50 p-8 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-emerald-950/30">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">
            Pregnancy food recommendation system
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-5xl">
            Pregnancy Nutrition Guide
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
            Personalized pregnancy-safe recipe recommendations, pregnancy risk analytics,
            and structured prescription report handling backed by the FastAPI service.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href="/features"
              className="rounded-full bg-zinc-950 px-4 py-2.5 font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              View features
            </Link>
            <Link
              href="/docs"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2.5 font-medium text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Read request formats
            </Link>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
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

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="text-sm font-semibold">Public pages</div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Use the dedicated Features and Docs pages to share what the app does and how to call the API.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="text-sm font-semibold">Backend base URL</div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Backend expected at <span className="font-mono">http://localhost:8080</span> (configurable via environment variables).
            </p>
          </div>
        </div>

        <div className="mt-8 text-xs text-zinc-600 dark:text-zinc-400">
          Backend expected at <span className="font-mono">http://localhost:8080</span> (configurable via environment variables).
        </div>
      </div>
    </div>
  );
}
