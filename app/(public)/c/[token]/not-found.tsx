export default function NotFoundPublic() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Link no disponible</h1>
        <p className="text-sm text-muted-foreground">
          Este link fue desactivado o no existe. Contactá a tu agencia para
          obtener uno nuevo.
        </p>
      </div>
    </div>
  );
}
