// -----------------------------------------------------------------------------
// What can go wrong talking to MyFoncia, and how it reads for the user.
//
// Every failure of the client is a FonciaError carrying a `code`: the
// Configuration screen, the connection status and the widget all explain it
// with the same sentence, in the four languages of Gladys.
// -----------------------------------------------------------------------------

export const ERROR_CODES = {
  NO_CREDENTIALS: 'no_credentials',
  NOT_CONFIGURED: 'not_configured',
  CREDENTIALS: 'credentials',
  MFA: 'mfa',
  LOCKED: 'locked',
  RATE_LIMITED: 'rate_limited',
  NETWORK: 'network',
  API: 'api',
};

export class FonciaError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {string} message technical detail, for the logs (never a secret)
   */
  constructor(code, message) {
    super(message);
    this.name = 'FonciaError';
    this.code = code;
  }
}

const MESSAGES = {
  [ERROR_CODES.NO_CREDENTIALS]: {
    en: 'Enter your MyFoncia e-mail and password in the configuration.',
    fr: 'Renseignez votre e-mail et votre mot de passe MyFoncia dans la configuration.',
    de: 'Gib deine MyFoncia-E-Mail-Adresse und dein Passwort in der Konfiguration ein.',
    es: 'Introduzca su correo y su contraseña de MyFoncia en la configuración.',
  },
  [ERROR_CODES.NOT_CONFIGURED]: {
    en: 'The MyFoncia client id is missing: fill in the advanced settings (see the documentation).',
    fr: "L'identifiant client MyFoncia manque : remplissez les réglages avancés (voir la documentation).",
    de: 'Die MyFoncia-Client-ID fehlt: Fülle die erweiterten Einstellungen aus (siehe Dokumentation).',
    es: 'Falta el identificador de cliente de MyFoncia: complete los ajustes avanzados (vea la documentación).',
  },
  [ERROR_CODES.CREDENTIALS]: {
    en: 'MyFoncia refused the e-mail or the password.',
    fr: "MyFoncia a refusé l'e-mail ou le mot de passe.",
    de: 'MyFoncia hat die E-Mail-Adresse oder das Passwort abgelehnt.',
    es: 'MyFoncia ha rechazado el correo o la contraseña.',
  },
  [ERROR_CODES.MFA]: {
    en: 'This MyFoncia account asks for a second factor, which the integration cannot answer.',
    fr: "Ce compte MyFoncia demande un second facteur, auquel l'intégration ne peut pas répondre.",
    de: 'Dieses MyFoncia-Konto verlangt einen zweiten Faktor, den die Integration nicht beantworten kann.',
    es: 'Esta cuenta de MyFoncia pide un segundo factor, que la integración no puede responder.',
  },
  [ERROR_CODES.LOCKED]: {
    en: 'The MyFoncia account is locked: unlock it on my-foncia.fonciamillenium.net first.',
    fr: "Le compte MyFoncia est bloqué : débloquez-le d'abord sur my-foncia.fonciamillenium.net.",
    de: 'Das MyFoncia-Konto ist gesperrt: Entsperre es zuerst auf my-foncia.fonciamillenium.net.',
    es: 'La cuenta de MyFoncia está bloqueada: desbloquéela primero en my-foncia.fonciamillenium.net.',
  },
  [ERROR_CODES.RATE_LIMITED]: {
    en: 'MyFoncia asks to slow down: the next sync will try again.',
    fr: 'MyFoncia demande de ralentir : la prochaine synchronisation réessaiera.',
    de: 'MyFoncia bittet um weniger Anfragen: Die nächste Synchronisierung versucht es erneut.',
    es: 'MyFoncia pide ir más despacio: la próxima sincronización lo volverá a intentar.',
  },
  [ERROR_CODES.NETWORK]: {
    en: 'MyFoncia cannot be reached: check the Internet connection of Gladys.',
    fr: 'MyFoncia est injoignable : vérifiez la connexion Internet de Gladys.',
    de: 'MyFoncia ist nicht erreichbar: Prüfe die Internetverbindung von Gladys.',
    es: 'No se puede acceder a MyFoncia: compruebe la conexión a Internet de Gladys.',
  },
  [ERROR_CODES.API]: {
    en: 'MyFoncia answered with an error: see the integration logs.',
    fr: "MyFoncia a répondu par une erreur : consultez les logs de l'intégration.",
    de: 'MyFoncia hat mit einem Fehler geantwortet: Siehe die Logs der Integration.',
    es: 'MyFoncia ha respondido con un error: consulte los registros de la integración.',
  },
};

/** The multi-language explanation of an error (any error: unknown ones read as API errors). */
export function describeError(err) {
  return MESSAGES[err?.code] ?? MESSAGES[ERROR_CODES.API];
}
