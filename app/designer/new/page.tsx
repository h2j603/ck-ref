import NewDesignerForm from "./NewDesignerForm";

export const metadata = {
  title: "New designer — CK Ref.",
};

export default function NewDesignerPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-2">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / designer / new
        </p>
        <h1 className="text-2xl font-medium tracking-tight">새 디자이너</h1>
      </header>
      <NewDesignerForm />
    </div>
  );
}
