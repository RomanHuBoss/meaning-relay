// Публичный ответ должен скрывать текст сообщения, если модератор пометил его
// как скрытый, сохраняя при этом остальные безопасные сведения о цепочке.
export function publicMessageText(message: { text: string; moderationStatus: string }): string {
  return message.moderationStatus === "HIDDEN" ? "[сообщение скрыто модератором]" : message.text;
}
