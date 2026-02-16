-- =============================================
-- FIX: DEALER REGISTRATION TRIGGER
-- =============================================
-- Issues fixed:
-- 1. handle_new_user was not reading role from user metadata
-- 2. auto_create_dealer_subscription was failing due to RLS policies
-- 
-- Solution: 
-- 1. Update handle_new_user to read role from raw_user_meta_data
-- 2. Update auto_create_dealer_subscription with proper error handling
-- 3. Add INSERT policies for dealer_subscriptions and dealer_credits
-- =============================================

-- First, fix the handle_new_user function to properly read role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get role from metadata, default to 'user' if not provided
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
    
    -- Validate role - only allow 'user' or 'dealer' from registration
    -- 'superadmin' cannot be self-assigned
    IF user_role NOT IN ('user', 'dealer') THEN
        user_role := 'user';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, balance, dealer_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        user_role,
        0,
        (NEW.raw_user_meta_data->>'dealer_id')::uuid
    )
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
    RETURN NEW;
END;
$$;

-- Recreate trigger for handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop and recreate the function with proper RLS bypass
CREATE OR REPLACE FUNCTION auto_create_dealer_subscription()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_default_package_id UUID;
    v_default_billing_cycle TEXT;
    v_default_trial_days INTEGER;
    v_package RECORD;
    v_end_date DATE;
BEGIN
    -- Only trigger for dealers
    IF NEW.role != 'dealer' THEN
        RETURN NEW;
    END IF;
    
    -- Get default settings
    SELECT value::text INTO v_default_package_id
    FROM system_settings WHERE key = 'default_dealer_package';
    
    SELECT value::text INTO v_default_billing_cycle
    FROM system_settings WHERE key = 'default_billing_cycle';
    
    SELECT COALESCE(value::integer, 30) INTO v_default_trial_days
    FROM system_settings WHERE key = 'default_trial_days';
    
    -- Default values if not set
    v_default_billing_cycle := COALESCE(TRIM(BOTH '"' FROM v_default_billing_cycle), 'immediate');
    v_default_trial_days := COALESCE(v_default_trial_days, 30);
    
    -- If no default package, skip auto-creation (don't fail)
    IF v_default_package_id IS NULL OR v_default_package_id = '' THEN
        -- Still create dealer_credits record even without subscription
        INSERT INTO dealer_credits (dealer_id, balance, pending_deduction)
        VALUES (NEW.id, 0, 0)
        ON CONFLICT (dealer_id) DO NOTHING;
        RETURN NEW;
    END IF;
    
    -- Remove quotes from UUID if present
    BEGIN
        v_default_package_id := TRIM(BOTH '"' FROM v_default_package_id)::UUID;
    EXCEPTION WHEN OTHERS THEN
        -- Invalid UUID, skip subscription creation
        INSERT INTO dealer_credits (dealer_id, balance, pending_deduction)
        VALUES (NEW.id, 0, 0)
        ON CONFLICT (dealer_id) DO NOTHING;
        RETURN NEW;
    END;
    
    -- Get package info
    SELECT * INTO v_package
    FROM subscription_packages
    WHERE id = v_default_package_id AND is_active = true;
    
    IF v_package IS NULL THEN
        -- Package not found or inactive, skip subscription but create credits
        INSERT INTO dealer_credits (dealer_id, balance, pending_deduction)
        VALUES (NEW.id, 0, 0)
        ON CONFLICT (dealer_id) DO NOTHING;
        RETURN NEW;
    END IF;
    
    -- Calculate end date based on trial
    v_end_date := CURRENT_DATE + v_default_trial_days;
    
    -- Create subscription with trial status
    INSERT INTO dealer_subscriptions (
        dealer_id,
        package_id,
        billing_model,
        billing_cycle,
        start_date,
        end_date,
        is_trial,
        trial_days,
        status
    ) VALUES (
        NEW.id,
        v_default_package_id,
        v_package.billing_model,
        v_default_billing_cycle,
        CURRENT_DATE,
        v_end_date,
        true,
        v_default_trial_days,
        'trial'
    )
    ON CONFLICT (dealer_id) DO NOTHING;
    
    -- Create dealer_credits record
    INSERT INTO dealer_credits (dealer_id, balance, pending_deduction)
    VALUES (NEW.id, 0, 0)
    ON CONFLICT (dealer_id) DO NOTHING;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the profile creation
    RAISE WARNING 'auto_create_dealer_subscription failed: %', SQLERRM;
    -- Still try to create credits
    BEGIN
        INSERT INTO dealer_credits (dealer_id, balance, pending_deduction)
        VALUES (NEW.id, 0, 0)
        ON CONFLICT (dealer_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create dealer_credits: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_auto_dealer_subscription ON profiles;
CREATE TRIGGER trigger_auto_dealer_subscription
    AFTER INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_dealer_subscription();

-- Add INSERT policy for dealer_subscriptions (for trigger)
DROP POLICY IF EXISTS "System can insert dealer subscriptions" ON dealer_subscriptions;
CREATE POLICY "System can insert dealer subscriptions" ON dealer_subscriptions
    FOR INSERT WITH CHECK (true);

-- Add INSERT policy for dealer_credits (for trigger)
DROP POLICY IF EXISTS "System can insert dealer credits" ON dealer_credits;
CREATE POLICY "System can insert dealer credits" ON dealer_credits
    FOR INSERT WITH CHECK (true);
