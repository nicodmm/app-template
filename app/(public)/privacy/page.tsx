export const metadata = { title: "Política de Privacidad — nao.fyi" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Política de Privacidad</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Última actualización: abril 2026
      </p>

      <div className="prose prose-sm max-w-none space-y-8 text-foreground">
        <section>
          <h2 className="text-lg font-semibold mb-3">1. Información que recopilamos</h2>
          <p className="text-muted-foreground leading-relaxed">
            Recopilamos la información que proporcionás al registrarte (email,
            nombre) y el contenido que subís a la plataforma (transcripciones
            de reuniones, notas manuales). También registramos datos de uso
            como acciones realizadas, fechas y frecuencia de uso del servicio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">2. Cómo usamos la información</h2>
          <p className="text-muted-foreground leading-relaxed">
            Usamos tu información para brindar el servicio de nao.fyi:
            procesar transcripciones con IA, generar resúmenes y señales de
            salud, y mantener el estado actualizado de tus cuentas. No
            vendemos ni compartimos datos personales con terceros, excepto
            con proveedores de infraestructura (Supabase, Anthropic) bajo
            acuerdos de confidencialidad.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">3. Almacenamiento y seguridad</h2>
          <p className="text-muted-foreground leading-relaxed">
            Los datos se almacenan en servidores seguros de Supabase
            (PostgreSQL en AWS). Las comunicaciones están cifradas mediante
            TLS. Los tokens de autenticación se gestionan a través de
            Supabase Auth con estándares de seguridad modernos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">4. Retención de datos</h2>
          <p className="text-muted-foreground leading-relaxed">
            Conservamos los datos mientras tu cuenta esté activa. Si eliminás
            tu cuenta, todos los datos asociados se eliminan permanentemente
            dentro de los 30 días siguientes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">5. Tus derechos (GDPR)</h2>
          <p className="text-muted-foreground leading-relaxed">
            Tenés derecho a acceder, corregir, exportar y eliminar tus datos
            personales en cualquier momento. Para ejercer estos derechos,
            contactanos en hola@nao.fyi.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">6. Cookies</h2>
          <p className="text-muted-foreground leading-relaxed">
            Usamos únicamente cookies necesarias para la autenticación y
            sesión. No usamos cookies de seguimiento ni publicidad de terceros.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">7. Contacto</h2>
          <p className="text-muted-foreground leading-relaxed">
            Para consultas sobre privacidad: hola@nao.fyi
          </p>
        </section>
      </div>
    </div>
  );
}
