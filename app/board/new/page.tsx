import NewBoardForm from "./NewBoardForm";

export const metadata = { title: "New board — CK Ref." };

export default function NewBoardPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-2">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / board / new
        </p>
        <h1 className="text-2xl font-medium tracking-tight">새 보드</h1>
      </header>
      <NewBoardForm />
    </div>
  );
}
