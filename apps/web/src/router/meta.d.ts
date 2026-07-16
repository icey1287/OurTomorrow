import "vue-router";

export {};

declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    guestOnly?: boolean;
    requiresAuth?: boolean;
    requiresCouple?: boolean;
    transitionKey?: string;
  }
}
