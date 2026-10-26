# Foncia pour Gladys Assistant

Cette intégration amène votre compte **MyFoncia** (Foncia, syndic de copropriété
et gestion locative) dans Gladys : solde du compte, prochaine somme à payer,
incidents ouverts, nouveaux documents et prochaine assemblée générale. Elle
ajoute aussi des déclencheurs de scène, des actions de scène et un widget de
tableau de bord.

> Intégration non officielle. Foncia ne publie pas d'API : l'intégration lit
> votre compte comme le fait le site my-foncia.fonciamillenium.net. Si Foncia modifie son site,
> l'intégration peut cesser de fonctionner jusqu'à sa mise à jour.

## Prérequis

- Gladys Assistant **5.3** ou plus récent.
- Un compte MyFoncia (e-mail et mot de passe) **sans second facteur** (code SMS
  ou application à chaque connexion) : l'intégration ne peut pas y répondre.
- Un accès Internet pour Gladys. C'est une intégration **cloud** : rien ne
  tourne sur votre réseau local.

## Configuration

| Champ                       | Quoi saisir                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| E-mail MyFoncia             | L'e-mail avec lequel vous vous connectez sur my-foncia.fonciamillenium.net.                             |
| Mot de passe MyFoncia       | Votre mot de passe. Stocké par Gladys comme secret, envoyé uniquement à la page de connexion de Foncia. |
| Intervalle de synchro (min) | Fréquence de lecture de MyFoncia. 60 par défaut, 15 minimum.                                            |
| Rappel d'échéance (jours)   | Combien de jours avant une échéance le déclencheur « Échéance à payer » se déclenche. 7 par défaut.     |
| Réglages avancés            | Laissez vide, voir [Réglages avancés](#réglages-avancés).                                               |

Appuyez ensuite sur **Tester la connexion** : le message liste les comptes
trouvés. **Synchroniser maintenant** lit MyFoncia tout de suite.

## Appareils

Un appareil Gladys par compte MyFoncia (un lot de copropriété, une location),
nommé `Foncia – <compte>`. Créez-le depuis l'onglet **Découverte**. Ses
fonctionnalités sont en lecture seule et gardent leur historique :

| Fonctionnalité                   | Unité | Signification                                                                  |
| -------------------------------- | ----- | ------------------------------------------------------------------------------ |
| Solde du compte                  | €     | Tel qu'affiché par MyFoncia (négatif : vous devez de l'argent).                |
| Prochaine somme à payer          | €     | Montant du prochain appel de fonds ou loyer.                                   |
| Jours avant l'échéance           | jours | Négatif une fois la date passée.                                               |
| Incidents ouverts                | —     | Demandes faites à Foncia (travaux, incidents, questions) pas encore clôturées. |
| Nouveaux documents               | —     | Documents ajoutés depuis la dernière fois où vous les avez marqués comme vus.  |
| Jours avant l'assemblée générale | jours | Prochaine AG de la copropriété.                                                |

Le badge de l'appareil indique **cloud**, ou **injoignable** quand la dernière
synchronisation a échoué.

## Déclencheurs de scène

Ils ne se déclenchent que pour ce qui est **nouveau** : la première
synchronisation après l'installation apprend seulement ce qui existe déjà. Au
plus 5 événements de chaque sorte par synchronisation, pour qu'une scène qui
envoie une notification par document n'inonde jamais votre téléphone.

| Déclencheur                | Filtres                  | Variables                                        |
| -------------------------- | ------------------------ | ------------------------------------------------ |
| Nouveau document Foncia    | compte, type de document | compte, titre, date                              |
| Incident Foncia mis à jour | compte, nouveau statut   | compte, titre, statut précédent                  |
| Échéance à payer           | compte                   | compte, montant, date d'échéance, jours restants |
| AG annoncée                | compte                   | compte, titre, date, jours restants              |

Types de document : appel de fonds, assemblée générale, relevé / décompte de
charges, facture ou quittance, autre. Statuts d'incident : ouvert, en cours,
clôturé.

Exemple : _« Quand un nouveau document Foncia de type **appel de fonds**
arrive, m'envoyer un message : Nouvel appel de fonds : {{triggerEvent.data.title}} »_.

## Actions de scène

- **Synchroniser Foncia** : lit MyFoncia maintenant et donne aux actions
  suivantes les chiffres d'un compte (vide = le premier) : réussite, compte,
  solde, somme à payer, date d'échéance, incidents ouverts, nouveaux documents.
- **Marquer les documents Foncia comme vus** : remet à 0 le compteur
  « Nouveaux documents » (d'un compte, ou de tous).

## Widget de tableau de bord

**Compte Foncia** : solde, somme à payer, incidents ouverts et nouveaux
documents (en direct), connexion et dernière synchro, prochaine échéance et
prochaine AG, les cinq derniers documents, et deux boutons : **Synchroniser** et
**Marquer comme vu**. Dans ses réglages, choisissez le compte à afficher (vide =
le premier).

## Confidentialité

- Le mot de passe n'est envoyé qu'à la page de connexion de Foncia
  (`login.my-foncia.fonciamillenium.net`). Il n'est jamais écrit dans les logs.
- Les jetons d'accès restent en mémoire. Le seul fichier écrit est
  `/data/foncia-state.json` : les identifiants des documents, incidents et
  assemblées déjà vus, pour qu'aucun déclencheur ne parte deux fois après un
  redémarrage.

## Dépannage

| Message                                       | Que faire                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| MyFoncia a refusé l'e-mail ou le mot de passe | Vérifiez-les en vous connectant sur my-foncia.fonciamillenium.net.                    |
| demande un second facteur                     | Non pris en charge : le compte demande un code à chaque connexion.                    |
| Le compte MyFoncia est bloqué                 | Débloquez-le sur my-foncia.fonciamillenium.net, puis appuyez sur Tester la connexion. |
| L'identifiant client MyFoncia manque          | Voir [Réglages avancés](#réglages-avancés).                                           |
| MyFoncia est injoignable                      | Vérifiez l'accès Internet de Gladys.                                                  |
| MyFoncia a répondu par une erreur             | Consultez les logs de l'intégration ; Foncia a peut-être modifié son site.            |

## Réglages avancés

L'intégration se connecte et lit votre compte avec les mêmes réglages que le
site MyFoncia : son **identifiant client** Okta et l'adresse de son **API**. Les
deux sont intégrés : laissez ces deux champs vides.

Si un jour Foncia les change et que chaque synchronisation échoue avec une
erreur d'API, lisez les nouvelles valeurs dans
<https://my-foncia.fonciamillenium.net/config.js> : `clientId` sous `oktaConfig`
est l'**identifiant client Okta**, `url` sous `graphql` est l'**URL de l'API
MyFoncia**. Saisissez-les dans les réglages avancés, enregistrez, puis appuyez
sur **Tester la connexion**. Ouvrez aussi un ticket sur le dépôt pour que les
valeurs intégrées soient mises à jour pour tout le monde.
