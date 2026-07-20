-- =============================================
-- LAO LOTTO - Change default symbol interpretation settings
-- Migration: 171_change_default_symbol_interpretation_settings.sql
-- =============================================

-- Change the default value of x_separator_behavior in profiles to 'revert'
ALTER TABLE public.profiles 
  ALTER COLUMN x_separator_behavior SET DEFAULT 'revert';

-- Update existing profiles that are set to 'auto' to the new default 'revert'
UPDATE public.profiles 
SET x_separator_behavior = 'revert' 
WHERE x_separator_behavior = 'auto' OR x_separator_behavior IS NULL;
