import { Participant, Vote, VoteType } from "@prisma/client";
import clsx from "clsx";
import dayjs from "dayjs";
import { useTranslation } from "next-i18next";
import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";

import List from "@/components/icons/list.svg";
import Table from "@/components/icons/table.svg";

import { getBrowserTimeZone } from "../../utils/date-time-utils";
import { trpc } from "../../utils/trpc";
import { PollOption } from "../../utils/trpc/types";
import { useWideScreen } from "../../utils/use-wide-screen";
import { Button } from "../button";
import { useModalContext } from "../modal/modal-provider";
import { RadioGroup } from "../radio";
import { useTimeZones } from "../time-zone-picker/time-zone-picker";
import { useRequiredContext } from "../use-required-context";
import { useUser } from "../user-provider";
import GridViewPoll from "./grid-view-poll";
import ListViewPoll from "./list-view-poll";
import { ParticipantForm, ParticipantInfo, PollViewOption } from "./types";
import { useDeleteParticipantModal } from "./use-delete-participant-modal";

interface PollDataContextValue {
  participants: Participant[];
  getParticipantInfoById: (id: string) => ParticipantInfo | undefined;
  getParticipantVoteForOptionAtIndex: (
    id: string,
    index: number,
  ) => VoteType | undefined;
  getParticipantsWhoVoted: (
    type: VoteType,
    optionIndex: number,
  ) => ParticipantInfo[];
  activeParticipant: ParticipantInfo | null;
}

const PollDataContext = React.createContext<PollDataContextValue | null>(null);
export const usePollData = () => {
  return useRequiredContext(PollDataContext);
};

const ToolbarButton = React.forwardRef<
  HTMLButtonElement,
  {
    children?: React.ReactNode;
    icon?: React.ComponentType<{ className?: string }>;
    className?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    active?: boolean;
  }
>(function ToolbarButton(
  { className, icon: Icon, active, children, ...forwardProps },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex h-8 items-center space-x-1 px-2 ",
        {
          "text-primary-500": active,
          "text-slate-600/75 hover:bg-slate-500/5 hover:text-slate-600 active:bg-gray-100":
            !active,
        },
        className,
      )}
      {...forwardProps}
    >
      {Icon ? <Icon className="h-4" /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
});

const ToolbarGroup = ({
  children,
  className,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={clsx(
        "flex items-center overflow-hidden rounded-md border bg-white shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const PollDataProvider: React.VoidFunctionComponent<{
  timeZone: string | null;
  admin?: boolean;
  pollId: string;
  options: PollOption[];
  participants: Array<Participant & { votes: Vote[] }>;
}> = ({ options, participants, timeZone, pollId, admin }) => {
  const [activeParticipant, setActiveParticipant] =
    React.useState<ParticipantInfo | null>(null);

  const { user } = useUser();

  const { t } = useTranslation("app");

  const userId = user.id;

  const { options: timezoneOptions, findFuzzyTz } = useTimeZones();

  const [targetTimeZone, setTargetTimeZone] = React.useState(
    () => findFuzzyTz(getBrowserTimeZone()).value,
  );

  const pollParticipants = participants.map(
    ({ id, name, votes, userId: participantUserId }) => {
      const isYou = userId === participantUserId;
      return {
        id,
        name,
        votes: options.map((option) => {
          return votes.find((vote) => vote.optionId === option.id)?.type;
        }),
        you: isYou,
        editable: admin || isYou,
      };
    },
  );

  const participantById = React.useMemo(() => {
    const map = new Map<string, ParticipantInfo>();
    pollParticipants.forEach((participant) => {
      map.set(participant.id, participant);
    });
    return map;
  }, [pollParticipants]);

  const getParticipantInfoById = React.useCallback(
    (id: string) => {
      const participant = participantById.get(id);
      if (!participant) {
        return undefined;
      }
      return participant;
    },
    [participantById],
  );

  const getParticipantVoteForOptionAtIndex = React.useCallback(
    (id: string, index: number) => {
      const participantInfo = getParticipantInfoById(id);
      return participantInfo?.votes[index];
    },
    [getParticipantInfoById],
  );

  const participantsByVoteType: Array<{
    yes: ParticipantInfo[];
    no: ParticipantInfo[];
    ifNeedBe: ParticipantInfo[];
  }> = React.useMemo(() => {
    return options.map((_, index) => {
      return pollParticipants.reduce<{
        yes: ParticipantInfo[];
        no: ParticipantInfo[];
        ifNeedBe: ParticipantInfo[];
      }>(
        (acc, participant) => {
          const voteType = participant.votes[index];
          if (voteType) {
            acc[voteType].push(participant);
          }

          return acc;
        },
        { yes: [], no: [], ifNeedBe: [] },
      );
    });
  }, [options, pollParticipants]);

  const queryClient = trpc.useContext();
  const addParticipant = trpc.useMutation(["polls.participants.add"], {
    onSuccess: (participant) => {
      queryClient.setQueryData(
        ["polls.participants.list", { pollId: participant.pollId }],
        (existingParticipants = []) => {
          return [...existingParticipants, participant];
        },
      );
    },
  });

  const updateParticipant = trpc.useMutation("polls.participants.update", {
    onSuccess: (participant) => {
      queryClient.setQueryData(
        ["polls.participants.list", { pollId: participant.pollId }],
        (existingParticipants = []) => {
          const newParticipants = [...existingParticipants];

          const index = newParticipants.findIndex(
            ({ id }) => id === participant.id,
          );

          if (index !== -1) {
            newParticipants[index] = participant;
          }

          return newParticipants;
        },
      );
    },
  });

  const getParticipantsWhoVoted = React.useCallback(
    (type: VoteType, optionIndex: number) => {
      return participantsByVoteType[optionIndex][type];
    },
    [participantsByVoteType],
  );

  const userAlreadyVoted =
    user && participants
      ? participants.some((participant) => participant.userId === user.id)
      : false;

  const contextValue = React.useMemo<PollDataContextValue>(
    () => ({
      participants,
      activeParticipant,
      getParticipantInfoById,
      getParticipantVoteForOptionAtIndex,
      getParticipantsWhoVoted,
    }),
    [
      participants,
      activeParticipant,
      getParticipantInfoById,
      getParticipantVoteForOptionAtIndex,
      getParticipantsWhoVoted,
    ],
  );

  const deleteParticipant = useDeleteParticipantModal();

  const isWideScreen = useWideScreen();

  const [preferredView, setPreferredView] = React.useState("grid");

  const view = isWideScreen ? preferredView : "list";

  const Compononent = view === "grid" ? GridViewPoll : ListViewPoll;

  const pollOptions: PollViewOption[] = React.useMemo(
    () =>
      options.map((option, index) => {
        const score = participants.reduce((acc, curr) => {
          const vote = curr.votes.find((vote) => vote.optionId === option.id);
          if (vote?.type === "yes") {
            acc += 1;
          }
          return acc;
        }, 0);

        if (option.value.type === "time") {
          const { start, end } = option.value;
          let startTime = dayjs(start);
          let endTime = dayjs(end);
          if (timeZone) {
            startTime = startTime.tz(timeZone).tz(targetTimeZone);
            endTime = endTime.tz(timeZone).tz(targetTimeZone);
          }
          return {
            type: "time",
            index,
            start: startTime.format("YYYY-MM-DDTHH:mm"),
            end: endTime.format("YYYY-MM-DDTHH:mm"),
            score,
          };
        }

        return {
          type: "date",
          index,
          date: option.value.date,
          score,
        };
      }),
    [options, participants, targetTimeZone, timeZone],
  );

  const formMethods = useForm<ParticipantForm>({
    defaultValues: { name: "", votes: [] },
  });

  const modalContext = useModalContext();

  return (
    <FormProvider {...formMethods}>
      <PollDataContext.Provider value={contextValue}>
        <div>
          <div className="break-container no-scrollbar flex space-x-4 overflow-x-auto px-4 pb-4 sm:justify-between">
            {isWideScreen ? (
              <RadioGroup
                value={view}
                options={[
                  {
                    label: t("grid"),
                    value: "grid",
                    icon: Table,
                  },
                  { label: t("list"), value: "list", icon: List },
                ]}
                onChange={setPreferredView}
              />
            ) : null}
            <div>
              {timeZone ? (
                <ToolbarGroup>
                  <div className="whitespace-nowrap pl-2 text-slate-500">
                    {t("timeZone")}
                  </div>
                  <select
                    className="h-9 w-80 appearance-none text-ellipsis border-0 p-0 pl-2 pr-8 focus:ring-0"
                    value={targetTimeZone}
                    onChange={(e) => {
                      setTargetTimeZone(e.target.value);
                    }}
                  >
                    {timezoneOptions.map((option) => {
                      return (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      );
                    })}
                  </select>
                </ToolbarGroup>
              ) : null}
            </div>
          </div>
          <form
            onSubmit={formMethods.handleSubmit((data) => {
              // do something
            })}
            className="card p-0"
          >
            <Compononent
              options={pollOptions}
              participants={pollParticipants}
              onEntry={async (participant) => {
                return await addParticipant.mutateAsync({
                  pollId,
                  name: participant.name,
                  votes: options.map(({ id }, i) => {
                    return {
                      optionId: id,
                      type: participant.votes[i] ?? "no",
                    };
                  }),
                });
              }}
              activeParticipant={activeParticipant}
              onChangeActiveParticipant={(participantId) => {
                if (participantId) {
                  const participant = getParticipantInfoById(participantId);
                  if (participant) {
                    formMethods.reset({
                      name: participant.name,
                      votes: participant.votes,
                    });
                    setActiveParticipant(participant);
                  }

                  return;
                }

                setActiveParticipant(null);
              }}
              onDeleteEntry={deleteParticipant}
              onUpdateEntry={async (participantId, participant) => {
                await updateParticipant.mutateAsync({
                  participantId,
                  pollId,
                  votes: options.map(({ id }, i) => {
                    return {
                      optionId: id,
                      type: participant.votes[i] ?? "no",
                    };
                  }),
                  name: participant.name,
                });
              }}
              isBusy={addParticipant.isLoading || updateParticipant.isLoading}
              userAlreadyVoted={userAlreadyVoted}
            />
          </form>
        </div>
      </PollDataContext.Provider>
    </FormProvider>
  );
};
