// Debug marker: a 9 x 9 pixel cross of exactly #FF00FF at a world position, drawn over everything.
// This is the one colour outside the palette, and it exists only for the gate test, which finds
// the markers in a screenshot. Each vertex carries the marker's world position in the mesh position
// and its corner (-1..1) in uv0; the corner is expanded in clip space so the size is in pixels.
Shader "Buried/Marker"
{
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Overlay" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedMarker"
            Blend Off
            ZTest Always
            ZWrite Off
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 corner : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 corner : TEXCOORD0;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                float4 clip = TransformObjectToHClip(input.positionOS.xyz);
                // Half the marker size is 4.5 px; one pixel is 2 / _ScreenParams.xy in clip units per w.
                clip.xy += input.corner * 4.5 * 2.0 / _ScreenParams.xy * clip.w;
                output.positionCS = clip;
                output.corner = input.corner;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                // A cross about 3 px thick inside the 9 px square.
                if (abs(input.corner.x) > 0.34 && abs(input.corner.y) > 0.34) discard;
                return half4(1.0, 0.0, 1.0, 1.0);
            }
            ENDHLSL
        }
    }
}
