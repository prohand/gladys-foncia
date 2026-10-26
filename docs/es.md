# Foncia para Gladys Assistant

Esta integración lleva su cuenta **MyFoncia** (Foncia, administración de
fincas: comunidades de propietarios y alquileres) a Gladys: saldo de la cuenta,
próximo importe a pagar, incidencias abiertas, documentos nuevos y la próxima
junta de propietarios. También añade disparadores de escena, acciones de escena
y un widget para el panel.

> Integración no oficial. Foncia no publica ninguna API: la integración lee su
> cuenta como lo hace el sitio myfoncia.fr. Si Foncia cambia su sitio, la
> integración puede dejar de funcionar hasta que se actualice.

## Requisitos

- Gladys Assistant **5.3** o posterior.
- Una cuenta MyFoncia (correo y contraseña) **sin segundo factor** (código por
  SMS o app en cada inicio de sesión): la integración no puede responderlo.
- Acceso a Internet para Gladys. Es una integración **cloud**: nada se ejecuta
  en su red local.

## Configuración

| Campo                             | Qué introducir                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Correo de MyFoncia                | El correo con el que inicia sesión en myfoncia.fr.                                                      |
| Contraseña de MyFoncia            | Su contraseña. Gladys la guarda como secreto y solo se envía a la página de inicio de sesión de Foncia. |
| Intervalo de sincronización (min) | Cada cuánto se lee MyFoncia. 60 por defecto, mínimo 15.                                                 |
| Aviso de vencimiento (días)       | Cuántos días antes de un vencimiento se activa el disparador «Pago pendiente». 7 por defecto.           |
| Ajustes avanzados                 | Déjelos vacíos, vea [Ajustes avanzados](#ajustes-avanzados).                                            |

Pulse después **Probar la conexión**: el mensaje enumera las cuentas encontradas.
**Sincronizar ahora** lee MyFoncia al momento.

## Dispositivos

Un dispositivo de Gladys por cuenta MyFoncia (un piso de una comunidad, un
alquiler), llamado `Foncia – <cuenta>`. Créelo desde la pestaña **Descubrir**.
Sus funciones son de solo lectura y conservan su historial:

| Función                   | Unidad | Significado                                                        |
| ------------------------- | ------ | ------------------------------------------------------------------ |
| Saldo de la cuenta        | €      | Tal como lo muestra MyFoncia (negativo: usted debe dinero).        |
| Próximo importe a pagar   | €      | Importe de la próxima derrama o del próximo alquiler.              |
| Días hasta el vencimiento | días   | Negativo una vez pasada la fecha.                                  |
| Incidencias abiertas      | —      | Incidencias y reparaciones aún no cerradas.                        |
| Documentos nuevos         | —      | Documentos añadidos desde la última vez que los marcó como vistos. |
| Días hasta la junta       | días   | Próxima junta de la comunidad de propietarios.                     |

La insignia del dispositivo indica **cloud**, o **inaccesible** cuando la última
sincronización ha fallado.

## Disparadores de escena

Solo se activan con lo **nuevo**: la primera sincronización tras la instalación
solo aprende lo que ya existe. Como máximo 5 eventos de cada tipo por
sincronización, para que una escena que envía una notificación por documento
nunca inunde su teléfono.

| Disparador                       | Filtros                   | Variables                                             |
| -------------------------------- | ------------------------- | ----------------------------------------------------- |
| Nuevo documento de Foncia        | cuenta, tipo de documento | cuenta, título, fecha                                 |
| Incidencia de Foncia actualizada | cuenta, nuevo estado      | cuenta, título, estado anterior                       |
| Pago pendiente                   | cuenta                    | cuenta, importe, fecha de vencimiento, días restantes |
| Junta convocada                  | cuenta                    | cuenta, título, fecha, días restantes                 |

Tipos de documento: derrama / cuota, junta de propietarios, extracto de gastos,
factura o recibo, otro. Estados de incidencia: abierta, en curso, cerrada.

Ejemplo: _«Cuando llegue un nuevo documento de Foncia de tipo **derrama /
cuota**, enviarme un mensaje: Nueva derrama: {{triggerEvent.data.title}}»_.

## Acciones de escena

- **Sincronizar Foncia**: lee MyFoncia ahora y pasa a las acciones siguientes
  las cifras de una cuenta (vacío = la primera): éxito, cuenta, saldo, importe
  debido, fecha de vencimiento, incidencias abiertas, documentos nuevos.
- **Marcar documentos de Foncia como vistos**: pone a 0 el contador
  «Documentos nuevos» (de una cuenta o de todas).

## Widget del panel

**Cuenta Foncia**: saldo, importe debido, incidencias abiertas y documentos
nuevos (en directo), conexión y última sincronización, próximo vencimiento y
próxima junta, los cinco últimos documentos y dos botones: **Sincronizar** y
**Marcar como visto**. En sus ajustes, elija la cuenta que se muestra (vacío = la
primera).

## Privacidad

- La contraseña solo se envía a la página de inicio de sesión de Foncia
  (`foncia.okta-emea.com`). Nunca se escribe en los registros.
- Los tokens de acceso se quedan en memoria. El único archivo escrito es
  `/data/foncia-state.json`: los identificadores de los documentos, incidencias
  y juntas ya vistos, para que ningún disparador se active dos veces tras un
  reinicio.

## Resolución de problemas

| Mensaje                                         | Qué hacer                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| MyFoncia ha rechazado el correo o la contraseña | Compruébelos iniciando sesión en myfoncia.fr.                                      |
| pide un segundo factor                          | No compatible: la cuenta pide un código en cada inicio de sesión.                  |
| La cuenta de MyFoncia está bloqueada            | Desbloquéela en myfoncia.fr y pulse Probar la conexión.                            |
| Falta el identificador de cliente de MyFoncia   | Vea [Ajustes avanzados](#ajustes-avanzados).                                       |
| No se puede acceder a MyFoncia                  | Compruebe el acceso a Internet de Gladys.                                          |
| MyFoncia ha respondido con un error             | Consulte los registros de la integración; puede que Foncia haya cambiado su sitio. |

## Ajustes avanzados

La aplicación web MyFoncia inicia sesión con un **ID de cliente** de Okta y lee
una API cuya dirección no está publicada. Si la integración indica que falta el
ID de cliente, o un error de API en cada sincronización, puede leer ambos
valores en su navegador:

1. Abra <https://myfoncia.fr> en un navegador de escritorio y abra las
   herramientas de desarrollo (F12), pestaña **Red**.
2. Inicie sesión. Busque la petición a `authorize`: su parámetro `client_id`
   es el **ID de cliente Okta**.
3. Una vez dentro, busque una petición con la cabecera
   `Authorization: Bearer`: el principio de su dirección (`https://host`) es la
   **URL de la API de MyFoncia**.

Introdúzcalos en los ajustes avanzados, guarde y pulse **Probar la conexión**.
Abra también una incidencia en el repositorio para que los valores por defecto
se actualicen para todos.
