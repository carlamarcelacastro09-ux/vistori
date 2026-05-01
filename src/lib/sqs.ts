import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export async function enqueueInvoiceJob(payload: { jobId: string }) {
  const queueUrl = process.env.SQS_QUEUE_URL;
  const region = process.env.AWS_REGION;
  if (!queueUrl || !region) return;

  const client = new SQSClient({ region });
  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    }),
  );
}
