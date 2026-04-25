export const metadata = { title: "Términos de Servicio — nao.fyi" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Términos de Servicio</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Última actualización: abril 2026
      </p>

      <div className="space-y-8 text-foreground">
        <section>
          <h2 className="text-lg font-semibold mb-3">1. Aceptación de los términos</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            Al usar nao.fyi aceptás estos términos de servicio. Si no estás
            de acuerdo, no uses el servicio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">2. Descripción del servicio</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            nao.fyi es una plataforma de inteligencia de cuentas que procesa
            transcripciones de reuniones con IA para extraer tareas, generar
            resúmenes y detectar señales de salud por cuenta. El servicio se
            ofrece a través de planes de suscripción.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">3. Cuenta y responsabilidades</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            Sos responsable de mantener la confidencialidad de tu cuenta y
            contraseña. También sos responsable del contenido que subís a la
            plataforma. No debés subir información de terceros sin su
            consentimiento.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">4. Suscripciones y pagos</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            Las suscripciones pagas se renuevan automáticamente cada mes. Podés
            cancelar en cualquier momento desde tu perfil a través del portal
            de Stripe. La cancelación es efectiva al fin del período actual.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">5. Propiedad intelectual</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            Los datos y contenido que subís pertenecen a vos. nao.fyi no
            reclama propiedad sobre tu contenido. Nos otorgás una licencia
            limitada para procesar el contenido y brindar el servicio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">6. Limitación de responsabilidad</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            nao.fyi se provee "tal como está". No garantizamos que el
            procesamiento de IA sea 100% preciso — los resultados deben ser
            revisados por el usuario. No somos responsables por decisiones
            tomadas basándose en la información generada por la plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">7. Contacto</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            Para consultas sobre estos términos: hola@nao.fyi
          </p>
        </section>
      </div>
    </div>
  );
}
