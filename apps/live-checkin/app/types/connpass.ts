interface CheckInResponse {
  checkedIn: boolean;
  userId: string | null;
  /** checkedIn が false の理由。成功時は null。 */
  reason: "already_checked_in" | "failed" | "error" | (string & {}) | null;
  /** 受付完了時に表示するプロモーションコード。無い場合は null/未定義。 */
  promoCode?: string | null;
}

interface EventSummary {
  id: string;
  url: string;
  editUrl: string;
  status: "draft" | "published" | "canceled";
  title: string;
  startAt: string;
  endAt: string;
  place?: string | null;
  participantsCount?: number | null;
}
