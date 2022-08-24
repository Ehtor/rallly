import { NextPage } from "next";
import { useTranslation } from "next-i18next";
import React from "react";

import { UserSession } from "@/utils/auth";

import { trpc } from "../utils/trpc";
import { useRequiredContext } from "./use-required-context";

export const UserContext =
  React.createContext<{
    user: UserSession;
    getAlias: () => string;
    setUser: React.Dispatch<React.SetStateAction<UserSession>>;
  } | null>(null);

export const useUser = () => {
  return useRequiredContext(UserContext, "UserContext");
};

export const useAuthenticatedUser = () => {
  const { user, ...rest } = useRequiredContext(UserContext, "UserContext");
  if (user.isGuest) {
    throw new Error("Expected authenticated user");
  }

  return { user, ...rest };
};

export const IfAuthenticated = (props: { children?: React.ReactNode }) => {
  const { user } = useUser();
  if (user.isGuest) {
    return null;
  }

  return <>{props.children}</>;
};

export const IfGuest = (props: { children?: React.ReactNode }) => {
  const { user } = useUser();
  if (!user.isGuest) {
    return null;
  }

  return <>{props.children}</>;
};

export const withUserSession = <P extends { user: UserSession }>(
  Component: NextPage<P>,
): NextPage<P> => {
  const Page: NextPage<P> = (props) => {
    const { t } = useTranslation("app");
    const [user, setUser] = React.useState<UserSession>(props.user);

    const context = trpc.useContext();

    const getAlias = React.useCallback(() => {
      if (!user.isGuest) {
        return user.name;
      }

      const [, id] = user.id.split("-");

      return `${t("guest")}-${id.substring(0, 4)}`;
    }, [t, user]);

    return (
      <UserContext.Provider
        value={{
          user,
          setUser: (newUser) => {
            context.invalidateQueries();
            setUser(newUser);
          },
          getAlias,
        }}
      >
        <Component {...props} />
      </UserContext.Provider>
    );
  };
  return Page;
};
