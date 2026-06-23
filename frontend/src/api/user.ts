import { userApi } from './client';
import { createAppQuery } from '~/lib/create-app-query';

interface UserInfo {
  user: string;
  email: string;
  preferredUsername: string;
  groups: string[];
}

export function useUserInfo() {
  return createAppQuery(() => ({
    queryKey: ['userinfo'],
    queryFn: async () => {
      const res = await fetch('/oauth2/userinfo');
      if (!res.ok) return { user: '', email: '', preferredUsername: '', groups: [] };
      const data = (await res.json()) as Partial<UserInfo>;
      return {
        user: data.user ?? '',
        email: data.email ?? '',
        preferredUsername: data.preferredUsername ?? '',
        groups: data.groups ?? [],
      };
    },
  }));
}

export function useCurrentUser() {
  return createAppQuery(() => ({
    queryKey: ['currentUser'],
    queryFn: () => userApi.me(),
  }));
}
