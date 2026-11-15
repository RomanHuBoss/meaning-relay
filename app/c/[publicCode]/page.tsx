// Эта страница отвечает за отдельный пользовательский сценарий и связывает представление с серверным контуром.
import { ChainDetail } from "../../../components/chain-detail";

export default async function InviteChainPage({ params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  return <ChainDetail publicCode={publicCode} />;
}
