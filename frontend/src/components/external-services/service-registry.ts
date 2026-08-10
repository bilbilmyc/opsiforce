import type { Component } from 'solid-js';
import type { EnvironmentSectionProps } from './environment-section-props';
import { IncomingEmailSection } from './incoming-email-section';
import { WhatsappResourcesSection } from './whatsapp-resources-section';
import { WhatsappSection } from './whatsapp-section';

export interface ExternalServiceUi {
  EnvironmentSection?: Component<EnvironmentSectionProps>;
  AdminSection?: Component;
}

export const EXTERNAL_SERVICE_UI: Record<string, ExternalServiceUi> = {
  'incoming-email': { EnvironmentSection: IncomingEmailSection },
  whatsapp: { EnvironmentSection: WhatsappSection, AdminSection: WhatsappResourcesSection },
};
