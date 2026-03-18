-- Create table for AI analysis logs
CREATE TABLE IF NOT EXISTS ai_analysis_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    round_id UUID NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
    dealer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    budget DECIMAL NOT NULL,
    input_summary JSONB,
    ai_response JSONB,
    model TEXT DEFAULT 'gpt-4o-mini',
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_round ON ai_analysis_logs(round_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_dealer ON ai_analysis_logs(dealer_id);

-- RLS policies
ALTER TABLE ai_analysis_logs ENABLE ROW LEVEL SECURITY;

-- Dealers can read their own logs
CREATE POLICY "Dealers can read own AI logs"
    ON ai_analysis_logs FOR SELECT
    USING (auth.uid() = dealer_id);

-- Service role can insert (Edge Function uses service role)
CREATE POLICY "Service role can insert AI logs"
    ON ai_analysis_logs FOR INSERT
    WITH CHECK (true);
