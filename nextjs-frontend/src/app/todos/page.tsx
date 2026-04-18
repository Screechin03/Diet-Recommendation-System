import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

type Todo = {
  id: number | string;
  name: string;
};

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos, error } = await supabase
    .from("todos")
    .select("id, name")
    .order("id", { ascending: true });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">Todos</h1>
        <p className="mt-2 text-sm text-red-600 dark:text-red-300">
          Failed to fetch todos: {error.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Todos</h1>
      {!todos || todos.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          No todos found.
        </p>
      ) : (
        <ul className="mt-3 list-disc pl-5">
          {(todos as Todo[]).map((todo) => (
            <li key={todo.id}>{todo.name}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
