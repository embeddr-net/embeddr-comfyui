import folder_paths
from comfy_api.latest import io


class EmbeddrLoRAStack(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        loras = folder_paths.get_filename_list("loras")

        inputs = [
            io.Model.Input("model"),
        ]

        # Add 1 slot initially, frontend will handle the rest
        inputs.append(io.Combo.Input("lora_1", default="None", options=["None", *loras]))
        inputs.append(io.Float.Input("strength_1", default=1.0, min=-10.0, max=10.0, step=0.01))

        return io.Schema(
            node_id="embeddr.LoRAStack",
            display_name="Embeddr LoRA Stack",
            description="Apply multiple LoRAs to a model and clip.",
            category="Embeddr",
            inputs=inputs,
            outputs=[
                io.Model.Output("model"),
            ],
        )

    @classmethod
    def execute(cls, model, **kwargs):
        import comfy.sd
        import comfy.utils

        out_model = model

        # Iterate over all provided lora inputs
        # We expect keys like lora_1, strength_1, lora_2, strength_2, etc.

        # Find all lora keys
        lora_keys = [k for k in kwargs if k.startswith("lora_")]
        # Sort them by index
        lora_keys.sort(key=lambda x: int(x.split("_")[1]))

        for key in lora_keys:
            i = key.split("_")[1]
            lora_name = kwargs.get(f"lora_{i}")
            strength = kwargs.get(f"strength_{i}", 1.0)

            if lora_name and lora_name != "None":
                lora_path = folder_paths.get_full_path("loras", lora_name)
                if lora_path:
                    lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                    out_model, _out_clip = comfy.sd.load_lora_for_models(
                        out_model, None, lora, strength, strength
                    )

        return io.NodeOutput(out_model)
