import NewProjectForm from "./NewProjectForm";

export const metadata = { title: "New WIP — KIWI Juice" };

export default function NewProjectPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-2">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / wip / new
        </p>
        <h1 className="text-2xl font-medium tracking-tight">새 작업</h1>
      </header>
      <NewProjectForm />
    </div>
  );
}
