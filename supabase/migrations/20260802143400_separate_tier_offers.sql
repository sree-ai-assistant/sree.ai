-- Separate Razorpay offer IDs by tier
DELETE FROM public.app_config WHERE key = 'razorpay_offer_id';

-- Insert the pro offer ID
INSERT INTO public.app_config (key, value) 
VALUES ('razorpay_offer_id_pro', 'offer_TKvEjUT3HQwcU4') 
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Insert the starter offer ID
INSERT INTO public.app_config (key, value) 
VALUES ('razorpay_offer_id_starter', 'offer_TKw370wwxyeEdv') 
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
