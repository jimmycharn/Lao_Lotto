-- Create dealer_lottery_templates table
CREATE TABLE IF NOT EXISTS public.dealer_lottery_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lottery_type TEXT NOT NULL,
    open_time TEXT NOT NULL DEFAULT '06:00',
    close_time TEXT NOT NULL DEFAULT '20:15',
    delete_before_minutes INTEGER NOT NULL DEFAULT 30,
    delete_after_submit_minutes INTEGER NOT NULL DEFAULT 120,
    currency_symbol TEXT NOT NULL DEFAULT '฿',
    currency_name TEXT NOT NULL DEFAULT 'บาท',
    notify_close_to_groups BOOLEAN NOT NULL DEFAULT true,
    set_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
    type_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    type_close_times JSONB NOT NULL DEFAULT '{}'::jsonb,
    type_close_time_behaviors JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dealer_id, lottery_type)
);

-- Enable RLS
ALTER TABLE public.dealer_lottery_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Dealers can read their own templates" 
ON public.dealer_lottery_templates 
FOR SELECT 
USING (auth.uid() = dealer_id);

CREATE POLICY "Dealers can insert their own templates" 
ON public.dealer_lottery_templates 
FOR INSERT 
WITH CHECK (auth.uid() = dealer_id);

CREATE POLICY "Dealers can update their own templates" 
ON public.dealer_lottery_templates 
FOR UPDATE 
USING (auth.uid() = dealer_id)
WITH CHECK (auth.uid() = dealer_id);

CREATE POLICY "Dealers can delete their own templates" 
ON public.dealer_lottery_templates 
FOR DELETE 
USING (auth.uid() = dealer_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at_templates()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_templates
BEFORE UPDATE ON public.dealer_lottery_templates
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at_templates();
